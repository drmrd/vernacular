import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  moveWallEndpoint,
  WALL_NODE_PREFIX,
  type Point,
  type UnitPreferences,
  type WallEnd,
  type WallSceneNode,
} from '../../core'
import type { EditorSession } from '../../bridge'
import { dragReadout, type DragReadout } from './drag-readout'
import type { DrawPlanOptions, PreviewSegment } from './draw-plan'
import { pickWallEndpoint } from './wall-editing'
import { useHeldAltKey } from './use-held-alt-key'
import { useSnapping, type Snapping } from './use-snapping'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0
// The wall-node id carries the `wall:` namespace (WALL_NODE_PREFIX from core); the
// command takes the raw id.
// A generous grab radius around a handle, in screen pixels, converted to a world
// tolerance so it stays a fixed on-screen target across zoom (like the snap
// tolerance in use-snapping). Slightly larger than the painted handle radius.
const HANDLE_GRAB_PIXELS = 10

interface WallEditingDeps {
  session: EditorSession
  // The single editable wall under the select tool, or null when none is.
  selectedWall: WallSceneNode | null
  walls: DrawPlanOptions['walls']
  viewport: Viewport
  preferences: UnitPreferences
}

export interface WallEditing {
  // The live wall preview while one endpoint is dragged, or undefined otherwise.
  preview: PreviewSegment | undefined
  // The reshaped wall's length-and-bearing readout pill anchored at the dragged
  // endpoint while a drag is live, or undefined otherwise.
  readout: DragReadout | undefined
  // Returns true when the pointer-down grabbed a handle and started a drag, so
  // the composition can give the drag priority over the marquee/click selection.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  // Returns true while an endpoint drag is in progress and consumed the move.
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/** The endpoint not being dragged; its position is the snap/preview origin and the fixed end of the wall. */
function anchorEndpoint(wall: WallSceneNode, dragged: WallEnd): Point {
  return dragged === 'start' ? wall.end : wall.start
}

/** The wall's current position for the dragged endpoint, so a no-move release dispatches nothing. */
function draggedEndpoint(wall: WallSceneNode, dragged: WallEnd): Point {
  return dragged === 'start' ? wall.start : wall.end
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

interface DragState {
  wall: WallSceneNode
  end: WallEnd
}

/** The wall drawn with its dragged endpoint at `movingPoint` and the fixed endpoint as the anchor. */
function previewFor(drag: DragState, movingPoint: Point): PreviewSegment {
  return { start: anchorEndpoint(drag.wall, drag.end), end: movingPoint }
}

/** Dispatch the undoable move unless the release lands the endpoint back on its original position. */
function dispatchMove(session: EditorSession, drag: DragState, snapped: Point): void {
  if (samePoint(snapped, draggedEndpoint(drag.wall, drag.end))) {
    return
  }
  const wallId = drag.wall.id.slice(WALL_NODE_PREFIX.length)
  session.dispatch(moveWallEndpoint(drag.wall.floorId, wallId, drag.end, snapped))
}

interface DragControl {
  drag: RefObject<DragState | null>
  // The last raw (pre-snap) world cursor recorded by the move handler, so a
  // modifier toggle with the pointer held still can re-resolve in place.
  lastRawCursor: RefObject<Point | null>
  setPreview: Dispatch<SetStateAction<PreviewSegment | undefined>>
  snapping: Snapping
  viewport: Viewport
}

/** A handle grab: pick an endpoint of the selected wall and begin the drag, reporting whether it grabbed. */
function useGrabHandler(
  selectedWall: WallSceneNode | null,
  control: DragControl,
): (event: PointerEvent<HTMLCanvasElement>) => boolean {
  const { drag, setPreview, viewport } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (selectedWall === null || event.button !== PRIMARY_BUTTON) {
        return false
      }
      const world = eventToWorld(event, viewport)
      const end = pickWallEndpoint(selectedWall, world, HANDLE_GRAB_PIXELS / viewport.scale)
      if (end === null) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      const started = { wall: selectedWall, end }
      drag.current = started
      setPreview(previewFor(started, draggedEndpoint(selectedWall, end)))
      return true
    },
    [selectedWall, drag, setPreview, viewport],
  )
}

/** Snap the moving cursor and repaint the live preview while a drag is in progress. */
function useDragMoveHandler(
  control: DragControl,
): (event: PointerEvent<HTMLCanvasElement>) => boolean {
  const { drag, lastRawCursor, setPreview, snapping, viewport } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      const active = drag.current
      if (active === null) {
        return false
      }
      const raw = eventToWorld(event, viewport)
      lastRawCursor.current = raw
      setPreview(previewFor(active, snapping.resolve(raw)))
      return true
    },
    [drag, lastRawCursor, setPreview, snapping, viewport],
  )
}

/** Release: clear the drag and dispatch an undoable move unless the endpoint did not move. */
function useReleaseHandler(
  session: EditorSession,
  control: DragControl,
): (event: PointerEvent<HTMLCanvasElement>) => void {
  const { drag, lastRawCursor, setPreview, snapping, viewport } = control
  return useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const active = drag.current
      drag.current = null
      lastRawCursor.current = null
      setPreview(undefined)
      snapping.clear()
      if (active === null) {
        return
      }
      event.currentTarget.releasePointerCapture(event.pointerId)
      dispatchMove(session, active, snapping.resolve(eventToWorld(event, viewport)))
    },
    [session, drag, lastRawCursor, setPreview, snapping, viewport],
  )
}

/**
 * Re-resolves and repaints the live endpoint preview when the free-angle modifier
 * toggles with the pointer held still, so pressing or releasing Alt settles onto (or
 * off of) the free angle in place. Mirrors the wall tool's free-angle re-resolve.
 */
function useReresolveEndpointOnFreeAngleToggle(control: DragControl, freeAngle: boolean): void {
  const { drag, lastRawCursor, setPreview, snapping } = control
  useEffect(() => {
    const active = drag.current
    if (active !== null && lastRawCursor.current !== null) {
      setPreview(previewFor(active, snapping.resolve(lastRawCursor.current)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the effect callback is recreated each render, so snapping and setPreview are always current; depend only on the modifier toggle
  }, [freeAngle])
}

/**
 * The endpoint-drag lifecycle for the single selected wall under the select
 * tool: a pointer-down on a handle grabs that endpoint, motion snaps the moving
 * cursor (reusing the slice-4 snapping with the fixed endpoint as the origin)
 * and previews the wall, and release dispatches an undoable `moveWallEndpoint`.
 * All decision logic lives in the pure modules (`pickWallEndpoint`, `snapPoint`,
 * `moveWallEndpoint`); this hook only wires them, so it is coverage-excluded glue.
 */
export function useWallEditing({
  session,
  selectedWall,
  walls,
  viewport,
  preferences,
}: WallEditingDeps): WallEditing {
  const drag = useRef<DragState | null>(null)
  const lastRawCursor = useRef<Point | null>(null)
  const [preview, setPreview] = useState<PreviewSegment | undefined>(undefined)
  const origin = drag.current ? anchorEndpoint(drag.current.wall, drag.current.end) : undefined
  const wallSelected = selectedWall !== null
  const freeAngle = useHeldAltKey(wallSelected)
  const snapping = useSnapping({ walls, viewport, origin, freeAngle })
  const control: DragControl = { drag, lastRawCursor, setPreview, snapping, viewport }
  const onPointerDown = useGrabHandler(selectedWall, control)
  const onPointerMove = useDragMoveHandler(control)
  const onPointerUp = useReleaseHandler(session, control)
  useReresolveEndpointOnFreeAngleToggle(control, freeAngle)
  const readout = preview ? dragReadout(preview.start, preview.end, preferences) : undefined

  return { preview, readout, onPointerDown, onPointerMove, onPointerUp }
}
