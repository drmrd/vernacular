import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Point } from '../../core'
import {
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
  type EditorSession,
  type SelectionStore,
} from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import { hitTestWalls, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { screenToWorld, DEFAULT_PLAN_SCALE, type Viewport } from './viewport'
import {
  advanceWallTool,
  IDLE_WALL_TOOL,
  wallPreviewSegment,
  type WallToolState,
} from './wall-tool'

const PLAN_WIDTH = 800
const PLAN_HEIGHT = 600
const VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

interface PointerContext {
  walls: DrawPlanOptions['walls']
  session: EditorSession
  selection: SelectionStore
  tool: ToolId
  toolState: WallToolState
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect()
  return screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, VIEWPORT)
}

/** Applies a click and returns the next wall-tool state. */
function applyPointer(world: Point, context: PointerContext): WallToolState {
  if (context.tool === 'select') {
    const hit = hitTestWalls(context.walls, world, DEFAULT_HIT_TOLERANCE_MM)
    if (hit) {
      context.selection.select(hit)
    } else {
      context.selection.clear()
    }
    return context.toolState
  }
  const floorId = context.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    return context.toolState
  }
  const result = advanceWallTool(context.toolState, world, floorId)
  if (result.command) {
    context.session.dispatch(result.command)
  }
  return result.state
}

interface PlanInteractionDeps {
  session: EditorSession
  walls: DrawPlanOptions['walls']
  selection: SelectionStore
  tool: ToolId
}

interface PlanInteraction {
  preview: PreviewSegment | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/** Translates pointer events into wall-tool actions and the live preview segment. */
function usePlanInteraction({
  session,
  walls,
  selection,
  tool,
}: PlanInteractionDeps): PlanInteraction {
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const context = { walls, session, selection, tool, toolState }
      setToolState(applyPointer(eventToWorld(event), context))
    },
    [walls, selection, session, tool, toolState],
  )

  // Track the cursor only while the wall tool is active; this drives the live
  // rubber-band preview. The select tool needs no per-move redraws.
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'draw-wall') {
        setPointer(eventToWorld(event))
      }
    },
    [tool],
  )

  const onPointerLeave = useCallback(() => setPointer(null), [])

  const preview =
    tool === 'draw-wall' && pointer ? wallPreviewSegment(toolState, pointer) : undefined

  return { preview, onPointerDown, onPointerMove, onPointerLeave }
}

interface PlanScene {
  walls: DrawPlanOptions['walls']
  selectedIds: ReadonlySet<string>
  preview: PreviewSegment | undefined
}

/** Redraws the canvas whenever the walls, selection, or in-progress preview change. */
function usePlanRedraw(canvasRef: RefObject<HTMLCanvasElement | null>, scene: PlanScene): void {
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      return
    }
    drawPlan(ctx, {
      walls: scene.walls,
      viewport: VIEWPORT,
      width: PLAN_WIDTH,
      height: PLAN_HEIGHT,
      selectedIds: scene.selectedIds,
      ...(scene.preview ? { preview: scene.preview } : {}),
    })
  }, [canvasRef, scene.walls, scene.selectedIds, scene.preview])
}

/**
 * The 2D plan editing surface: the Canvas-and-pointer glue binding the tested pure
 * pieces (viewport, wall tool, hit testing, drawing) to React, the session, the
 * selection store, and the active tool. It is coverage-excluded and validated by
 * the wall-drawing end-to-end spec, since jsdom has no 2D Canvas.
 */
export function PlanView() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const { tool } = useActiveTool()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { preview, onPointerDown, onPointerMove, onPointerLeave } = usePlanInteraction({
    session,
    walls: graph.walls,
    selection,
    tool,
  })
  usePlanRedraw(canvasRef, { walls: graph.walls, selectedIds, preview })

  return (
    <canvas
      ref={canvasRef}
      width={PLAN_WIDTH}
      height={PLAN_HEIGHT}
      aria-label="Floor plan"
      className="plan-view"
      style={{ touchAction: 'none', cursor: tool === 'draw-wall' ? 'crosshair' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    />
  )
}
