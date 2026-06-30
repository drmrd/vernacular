import { useCallback, useRef, useState, type PointerEvent } from 'react'
import type { Point, SceneGraph, UnitPreferences } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { DragReadout } from './drag-readout'
import type { PreviewSegment } from './draw-plan'
import { DEFAULT_HIT_TOLERANCE_MM, hitTest } from './hit-test'
import {
  beginMoveDrag,
  endMoveDrag,
  IDLE_MOVE_DRAG,
  moveDragGhost,
  moveDragReadout,
  moveDragReadoutPoint,
  type MoveDragState,
} from './move-drag'
import { selectedEntityIds, selectionGhostSegments } from './selection-entities'
import { snapPoint } from './snap'
import { useOptionalSnapPreferences } from './snap-preferences-context'
import { buildSnapContext } from './use-snapping'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface SelectionMoveDeps {
  session: EditorSession
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  tool: ToolId
  viewport: Viewport
  preferences: UnitPreferences
  // The floor a move commits to (the active floor); null before any floor is selected.
  activeFloorId: string | null
}

// The floor a move commits to: the active floor, falling back to the first floor
// when none is active yet (a single-floor project before any switch).
function moveFloorId(deps: SelectionMoveDeps): string | undefined {
  return deps.activeFloorId ?? deps.session.getProject().floors[0]?.id
}

export interface SelectionMove {
  // The translated ghost of the dragged selection, or empty when no drag is active.
  ghost: readonly PreviewSegment[]
  // The displacement readout pill anchored at the pointer during a move-drag, or
  // undefined when no drag is active.
  readout: DragReadout | undefined
  // Each handler returns true when it consumes the pointer, so the composed
  // handlers can stop before the marquee/click selection runs.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => boolean
}

// The mutable drag state, the ghost setter, and the readout setter, bundled so the
// handlers stay a single parameter object beside their deps.
interface MoveHandle {
  stateRef: { current: MoveDragState }
  setGhost: (ghost: readonly PreviewSegment[]) => void
  setReadout: (readout: DragReadout | undefined) => void
  // Resolves a proposed world point to the nearest snap target, so the move-drag
  // anchors the whole group on a snapped representative point.
  snap: (point: Point) => Point
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The snap resolver the move-drag anchors on: it snaps a proposed world point to the
 * nearest target, with the dragged selection filtered out so the move never snaps to
 * its own pre-move position. No origin is passed, which leaves the directional snaps
 * (angle, perpendicular, parallel) off, since a translation has no draw-origin.
 */
function useMoveSnapResolver(deps: SelectionMoveDeps): (point: Point) => Point {
  const snapPreferences = useOptionalSnapPreferences()
  return useCallback(
    (point: Point): Point => {
      const targets = deps.graph.walls.filter((wall) => !deps.selectedIds.has(wall.id))
      const context = buildSnapContext(
        { walls: targets, viewport: deps.viewport, origin: undefined },
        snapPreferences,
      )
      return snapPoint(point, context)?.point ?? point
    },
    [deps.graph, deps.selectedIds, deps.viewport, snapPreferences],
  )
}

// True when the pointer is over an entity that is already selected, so a press
// begins a move rather than a fresh selection.
function grabsSelection(deps: SelectionMoveDeps, world: Point): boolean {
  const hit = hitTest(deps.graph, world, DEFAULT_HIT_TOLERANCE_MM)
  return hit !== null && deps.selectedIds.has(hit)
}

function beginDrag(deps: SelectionMoveDeps, handle: MoveHandle, world: Point): boolean {
  if (!grabsSelection(deps, world)) {
    return false
  }
  const segments = selectionGhostSegments(deps.graph, deps.selectedIds)
  if (segments.length === 0) {
    return false
  }
  handle.stateRef.current = beginMoveDrag(world, segments)
  handle.setGhost(segments)
  handle.setReadout(moveDragReadout(handle.stateRef.current, world, deps.preferences))
  return true
}

function pointerDown(
  deps: SelectionMoveDeps,
  handle: MoveHandle,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  if (deps.tool !== 'select' || event.button !== PRIMARY_BUTTON) {
    return false
  }
  return beginDrag(deps, handle, eventToWorld(event, deps.viewport))
}

function pointerMove(
  deps: SelectionMoveDeps,
  handle: MoveHandle,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  if (handle.stateRef.current.phase !== 'dragging') {
    return false
  }
  const world = eventToWorld(event, deps.viewport)
  const state = handle.stateRef.current
  handle.setGhost(moveDragGhost(state, world, handle.snap))
  // The readout measures from the grab origin to the snapped point, so the chip shows
  // the snapped displacement the ghost and the commit use, not the raw cursor distance.
  const snappedPointer = moveDragReadoutPoint(state, world, handle.snap)
  handle.setReadout(moveDragReadout(state, snappedPointer, deps.preferences))
  return true
}

function pointerUp(
  deps: SelectionMoveDeps,
  handle: MoveHandle,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  const state = handle.stateRef.current
  if (state.phase !== 'dragging') {
    return false
  }
  handle.stateRef.current = IDLE_MOVE_DRAG
  handle.setGhost([])
  handle.setReadout(undefined)
  const floorId = moveFloorId(deps)
  if (floorId === undefined) {
    return true
  }
  const result = endMoveDrag(state, eventToWorld(event, deps.viewport), {
    floorId,
    entityIds: selectedEntityIds(deps.selectedIds),
    snap: handle.snap,
  })
  if (result.command) {
    deps.session.dispatch(result.command)
  }
  return true
}

/**
 * The select-tool move-drag: a press on a selected entity begins a rigid drag of
 * the whole selection (walls and dimensions), a move updates the live ghost, and
 * the release commits a `translateEntities`. Each handler reports whether it
 * consumed the pointer so the composed handlers route this beneath the endpoint
 * and opening drags and above the marquee. Inert under any tool but `select`.
 */
export function useSelectionMove(deps: SelectionMoveDeps): SelectionMove {
  const stateRef = useRef<MoveDragState>(IDLE_MOVE_DRAG)
  const [ghost, setGhost] = useState<readonly PreviewSegment[]>([])
  const [readout, setReadout] = useState<DragReadout | undefined>(undefined)
  const snap = useMoveSnapResolver(deps)
  const handle: MoveHandle = { stateRef, setGhost, setReadout, snap }
  return {
    ghost,
    readout,
    onPointerDown: (event) => pointerDown(deps, handle, event),
    onPointerMove: (event) => pointerMove(deps, handle, event),
    onPointerUp: (event) => pointerUp(deps, handle, event),
  }
}
