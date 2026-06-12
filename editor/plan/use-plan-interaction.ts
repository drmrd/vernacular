import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { DrawPlanOptions } from './draw-plan'
import type { SnapResult } from './snap'
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
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

/** The earlier corners the cursor can snap back onto: every corner except the one being drawn from. */
function openCorners(toolState: WallToolState): readonly Point[] {
  return toolState.phase === 'drawing' ? toolState.vertices.slice(0, -1) : []
}

function activeFloorId(session: EditorSession): string | undefined {
  return session.getProject().floors[0]?.id
}

/** Applies a wall-tool click and returns the next wall-tool state; other tools are inert here. */
function applyPointer(world: Point, context: PointerContext): WallToolState {
  if (context.tool !== 'draw-wall') {
    return context.toolState
  }
  const floorId = context.session.getProject().floors[0]?.id
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
  const [free, setFree] = useState(false)
  useEffect(() => {
    if (tool !== 'draw-wall') {
      setFree(false)
      return
    }
    const update = (event: KeyboardEvent) => setFree(event.altKey)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
    }
  }, [tool])
  return free
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

/** Escape abandons the run, Enter finishes it, and Backspace removes the last corner. */
function useWallKeyboard({
  tool,
  finish,
  snapping,
  setToolState,
  setPointer,
}: WallKeyboardDeps): void {
  useEffect(() => {
    if (tool !== 'draw-wall') {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setToolState(cancelWallTool)
        setPointer(null)
        snapping.clear()
      } else if (event.key === 'Enter') {
        finish()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        setToolState(backspaceWallTool)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool, finish, snapping, setToolState, setPointer])
}

/** Translates pointer events into wall-tool actions, the live preview, and the snap indicator. */
// eslint-disable-next-line max-lines-per-function -- one hook wiring the tool state, pointer, snapping inputs, and pointer handlers; each input is irreducible
export function usePlanInteraction(deps: PlanInteractionDeps): PlanInteraction {
  const { session, walls, tool, viewport, tracePoints } = deps
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)
  const freeAngle = useFreeAngleModifier(tool)
  const snapping = useSnapping({
    walls,
    viewport,
    origin: drawingVertex(toolState),
    ...(tracePoints ? { tracePoints } : {}),
    openVertices: openCorners(toolState),
    freeAngle,
  })
  const recordRawCursor = useReresolveOnFreeAngleToggle({ tool, freeAngle, snapping, setPointer })

  const toolStateRef = useRef(toolState)
  toolStateRef.current = toolState

  const finish = useCallback(() => {
    const floorId = activeFloorId(session)
    if (floorId === undefined) {
      return
    }
    const result = finishWallTool(toolStateRef.current, floorId)
    result.commands?.forEach((command) => session.dispatch(command))
    setToolState(result.state)
    setPointer(null)
    snapping.clear()
  }, [session, snapping])

  useWallKeyboard({ tool, finish, snapping, setToolState, setPointer })

  const onDoubleClick = useCallback(() => {
    if (tool === 'draw-wall') {
      finish()
    }
  }, [tool, finish])

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const world = snapping.resolve(eventToWorld(event, viewport))
      setToolState(applyPointer(world, { session, tool, toolState }))
    },
    [session, tool, toolState, viewport, snapping],
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
