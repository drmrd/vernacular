import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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
import { drawPlan, type DrawPlanOptions } from './draw-plan'
import { hitTestWalls, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { screenToWorld, DEFAULT_PLAN_SCALE, type Viewport } from './viewport'
import { advanceWallTool, IDLE_WALL_TOOL, type WallToolState } from './wall-tool'

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
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      return
    }
    drawPlan(ctx, {
      walls: graph.walls,
      viewport: VIEWPORT,
      width: PLAN_WIDTH,
      height: PLAN_HEIGHT,
      selectedIds,
    })
  }, [graph, selectedIds])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const context = { walls: graph.walls, session, selection, tool, toolState }
      setToolState(applyPointer(eventToWorld(event), context))
    },
    [graph, selection, session, tool, toolState],
  )

  return (
    <canvas
      ref={canvasRef}
      width={PLAN_WIDTH}
      height={PLAN_HEIGHT}
      aria-label="Floor plan"
      className="plan-view"
      style={{ touchAction: 'none', cursor: tool === 'draw-wall' ? 'crosshair' : 'default' }}
      onPointerDown={handlePointerDown}
    />
  )
}
