import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { DrawPlanOptions } from './draw-plan'
import type { SnapResult } from './snap'
import { useHeldAltKey } from './use-held-alt-key'
import { useSnapping, type Snapping } from './use-snapping'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'
import {
  advanceWallTool,
  backspaceWallTool,
  cancelWallTool,
  drawingVertex,
  finishWallTool,
  IDLE_WALL_TOOL,
  wallGhostSegments,
  wallPreviewSegment,
  type PreviewSegment,
  type WallToolState,
} from './wall-tool'

interface PointerContext {
  session: EditorSession
  tool: ToolId
  toolState: WallToolState
  activeFloorId: string | null
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/**
 * The corners of the active run the cursor can snap back onto, including the corner
 * being drawn from. Snapping onto the first corner closes the loop; snapping onto the
 * active (last) corner lets a click there end the run without leaving a sliver.
 */
function activeRunCorners(toolState: WallToolState): readonly Point[] {
  return toolState.phase === 'drawing' ? [...toolState.vertices] : []
}

/** The floor a new wall lands on: the active floor, falling back to the first floor
 *  when none is active yet (a single-floor project before any switch). */
function drawFloorId(context: PointerContext): string | undefined {
  return context.activeFloorId ?? context.session.getProject().floors[0]?.id
}

/** Applies a wall-tool click and returns the next wall-tool state; other tools are inert here. */
function applyPointer(world: Point, context: PointerContext): WallToolState {
  if (context.tool !== 'draw-wall') {
    return context.toolState
  }
  const floorId = drawFloorId(context)
  if (floorId === undefined) {
    return context.toolState
  }
  const result = advanceWallTool(context.toolState, world, floorId)
  result.commands?.forEach((command) => context.session.dispatch(command))
  return result.state
}

export interface PlanInteractionDeps {
  session: EditorSession
  walls: DrawPlanOptions['walls']
  tool: ToolId
  viewport: Viewport
  // The floor a new wall is drawn on (the active floor); null before any floor is selected.
  activeFloorId: string | null
  // Underlay footprint corners to snap to in trace mode; absent when off.
  tracePoints?: readonly Point[]
}

export interface PlanInteraction {
  preview: PreviewSegment | undefined
  ghost: PreviewSegment[]
  snap: SnapResult | null
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onDoubleClick: () => void
  onPointerLeave: () => void
}

interface WallKeyboardDeps {
  tool: ToolId
  finish: () => void
  backspace: () => void
  snapping: Snapping
  setToolState: (updater: (state: WallToolState) => WallToolState) => void
  setPointer: (pointer: Point | null) => void
}

/**
 * Tracks the Alt (Option on a Mac) key as the held free-angle modifier while the wall
 * tool is active. Holding it suppresses the default angle lock so the cursor draws a
 * free angle; releasing it restores the lock. Reset to false whenever the tool changes.
 */
function useFreeAngleModifier(tool: ToolId): boolean {
  return useHeldAltKey(tool === 'draw-wall')
}

interface FreeAngleResolveDeps {
  tool: ToolId
  freeAngle: boolean
  snapping: Snapping
  setPointer: (pointer: Point | null) => void
}

/**
 * Tracks the last raw (pre-snap) cursor and re-resolves the snapped ghost when the
 * free-angle modifier toggles, so pressing or releasing Alt updates the ghost without a
 * pointer move. Returns a recorder the move handler calls with each raw cursor.
 */
function useReresolveOnFreeAngleToggle({
  tool,
  freeAngle,
  snapping,
  setPointer,
}: FreeAngleResolveDeps): (raw: Point) => void {
  const lastRawCursor = useRef<Point | null>(null)
  useEffect(() => {
    if (tool === 'draw-wall' && lastRawCursor.current !== null) {
      setPointer(snapping.resolve(lastRawCursor.current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the effect callback is recreated each render, so snapping and setPointer are always current; depend only on the modifier toggle
  }, [freeAngle])
  // A stable recorder: it only writes a ref, so its identity needs no deps, which
  // keeps the move handler's useCallback (which lists it) from re-creating each render.
  return useCallback((raw: Point) => {
    lastRawCursor.current = raw
  }, [])
}

/**
 * Escape abandons the run, Enter ends it, and Backspace undoes the last segment.
 *
 * The handlers are read through a ref that is refreshed every render, so the
 * window listener subscribes once per tool change rather than on every render.
 * A render-scoped subscription would re-add the listener mid-keystroke whenever
 * a sibling hook (such as the keyboard authoring hook) updates state inside the
 * same keydown, and the DOM drops a listener re-added during dispatch, which
 * would silently swallow this run-control key. The stable subscription keeps the
 * wall run controllable no matter what else listens on the window.
 */
function useWallKeyboard({
  tool,
  finish,
  backspace,
  snapping,
  setToolState,
  setPointer,
}: WallKeyboardDeps): void {
  const handlersRef = useRef({ finish, backspace, snapping, setToolState, setPointer })
  handlersRef.current = { finish, backspace, snapping, setToolState, setPointer }
  useEffect(() => {
    if (tool !== 'draw-wall') {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const handlers = handlersRef.current
      if (event.key === 'Escape') {
        handlers.setToolState(cancelWallTool)
        handlers.setPointer(null)
        handlers.snapping.clear()
      } else if (event.key === 'Enter') {
        handlers.finish()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        handlers.backspace()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool])
}

interface WallSnappingDeps {
  walls: DrawPlanOptions['walls']
  viewport: Viewport
  toolState: WallToolState
  tracePoints: readonly Point[] | undefined
  freeAngle: boolean
}

/**
 * Assembles the wall-drawing inputs for `useSnapping`: the draw origin, the
 * underlay trace points, and the open run's corners. The conditional spreads keep
 * the object exactOptionalPropertyTypes-safe, only adding the optional candidate
 * sets when they are present and non-empty.
 */
function wallSnappingInputs({
  walls,
  viewport,
  toolState,
  tracePoints,
  freeAngle,
}: WallSnappingDeps) {
  const openVertices = activeRunCorners(toolState)
  return {
    walls,
    viewport,
    origin: drawingVertex(toolState),
    ...(tracePoints ? { tracePoints } : {}),
    ...(openVertices.length > 0 ? { openVertices } : {}),
    freeAngle,
  }
}

interface WallGestureDeps {
  session: EditorSession
  tool: ToolId
  snapping: Snapping
  toolState: WallToolState
  setToolState: Dispatch<SetStateAction<WallToolState>>
  setPointer: (pointer: Point | null) => void
}

/**
 * Owns the finishing gestures of a wall run: it commits the open run (Enter via the
 * keyboard hook, or a double-click) and clears the cursor and snap indicator. The
 * latest tool state is read through a ref that is updated every render, so `finish`
 * reads the current run without listing `toolState` in its deps and without
 * re-subscribing the keyboard effect on every dropped corner.
 */
function useWallGesture({
  session,
  tool,
  snapping,
  toolState,
  setToolState,
  setPointer,
}: WallGestureDeps): { onDoubleClick: () => void } {
  const toolStateRef = useRef(toolState)
  toolStateRef.current = toolState

  const finish = useCallback(() => {
    setToolState((state) => finishWallTool(state).state)
    setPointer(null)
    snapping.clear()
  }, [snapping, setToolState, setPointer])

  // Backspace steps the draw-from corner back one and undoes the segment that
  // corner committed; an anchor-only run (one corner, no segment) just cancels.
  const backspace = useCallback(() => {
    const state = toolStateRef.current
    if (state.phase === 'drawing' && state.vertices.length >= 2) {
      session.undo()
    }
    setToolState((current) => backspaceWallTool(current))
  }, [session, setToolState])

  useWallKeyboard({ tool, finish, backspace, snapping, setToolState, setPointer })

  const onDoubleClick = useCallback(() => {
    if (tool === 'draw-wall') {
      finish()
    }
  }, [tool, finish])

  return { onDoubleClick }
}

/** Translates pointer events into wall-tool actions, the live preview, and the snap indicator. */
export function usePlanInteraction(deps: PlanInteractionDeps): PlanInteraction {
  const { session, walls, tool, viewport, tracePoints, activeFloorId } = deps
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)
  const freeAngle = useFreeAngleModifier(tool)
  const snapping = useSnapping(
    wallSnappingInputs({ walls, viewport, toolState, tracePoints, freeAngle }),
  )
  const recordRawCursor = useReresolveOnFreeAngleToggle({ tool, freeAngle, snapping, setPointer })

  const gesture = { session, tool, snapping, toolState, setToolState, setPointer }
  const { onDoubleClick } = useWallGesture(gesture)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const world = snapping.resolve(eventToWorld(event, viewport))
      setToolState(applyPointer(world, { session, tool, toolState, activeFloorId }))
    },
    [session, tool, toolState, viewport, snapping, activeFloorId],
  )

  // Track the cursor only while the wall tool is active; this drives the live
  // rubber-band preview and the snap indicator. The select tool needs neither.
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'draw-wall') {
        const raw = eventToWorld(event, viewport)
        recordRawCursor(raw)
        setPointer(snapping.resolve(raw))
      }
    },
    [tool, viewport, snapping, recordRawCursor],
  )

  const onPointerLeave = useCallback(() => {
    setPointer(null)
    snapping.clear()
  }, [snapping])

  const preview =
    tool === 'draw-wall' && pointer ? wallPreviewSegment(toolState, pointer) : undefined
  const ghost = tool === 'draw-wall' ? wallGhostSegments(toolState) : []
  const snap = tool === 'draw-wall' ? snapping.snap : null

  return { preview, ghost, snap, onPointerDown, onPointerMove, onDoubleClick, onPointerLeave }
}
