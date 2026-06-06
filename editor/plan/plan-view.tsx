import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Point, SceneGraph, WallSceneNode } from '../../core'
import {
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
  type EditorSession,
} from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import type { Bounds } from './fit'
import { singleSelectedWall } from './selected-wall'
import { usePlanSelection, type PlanSelection } from './use-plan-selection'
import { useWallEditing, type WallEditing } from './use-wall-editing'
import {
  eventToCanvas,
  useFitToContent,
  useViewportControls,
  type ViewportControls,
} from './use-viewport-controls'
import type { SnapResult } from './snap'
import { useSnapping } from './use-snapping'
import { screenToWorld, DEFAULT_PLAN_SCALE, type Viewport } from './viewport'
import {
  advanceWallTool,
  IDLE_WALL_TOOL,
  wallPreviewSegment,
  type WallToolState,
} from './wall-tool'

const PLAN_WIDTH = 800
const PLAN_HEIGHT = 600
const PLAN_SIZE = { width: PLAN_WIDTH, height: PLAN_HEIGHT }

interface PointerContext {
  session: EditorSession
  tool: ToolId
  toolState: WallToolState
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
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
  if (result.command) {
    context.session.dispatch(result.command)
  }
  return result.state
}

interface PlanInteractionDeps {
  session: EditorSession
  walls: DrawPlanOptions['walls']
  tool: ToolId
  viewport: Viewport
}

interface PlanInteraction {
  preview: PreviewSegment | undefined
  snap: SnapResult | null
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

/** The in-progress segment start while drawing; absent when the tool is idle. */
function drawingOrigin(toolState: WallToolState): Point | undefined {
  return toolState.phase === 'drawing' ? toolState.start : undefined
}

/** Translates pointer events into wall-tool actions, the live preview, and the snap indicator. */
function usePlanInteraction({
  session,
  walls,
  tool,
  viewport,
}: PlanInteractionDeps): PlanInteraction {
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [pointer, setPointer] = useState<Point | null>(null)
  const snapping = useSnapping({ walls, viewport, origin: drawingOrigin(toolState) })

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const world = snapping.resolve(eventToWorld(event, viewport))
      const context = { session, tool, toolState }
      setToolState(applyPointer(world, context))
    },
    [session, tool, toolState, viewport, snapping],
  )

  // Track the cursor only while the wall tool is active; this drives the live
  // rubber-band preview and the snap indicator. The select tool needs neither.
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'draw-wall') {
        setPointer(snapping.resolve(eventToWorld(event, viewport)))
      }
    },
    [tool, viewport, snapping],
  )

  const onPointerLeave = useCallback(() => {
    setPointer(null)
    snapping.clear()
  }, [snapping])

  const preview =
    tool === 'draw-wall' && pointer ? wallPreviewSegment(toolState, pointer) : undefined
  const snap = tool === 'draw-wall' ? snapping.snap : null

  return { preview, snap, onPointerDown, onPointerMove, onPointerLeave }
}

interface ComposedPointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

interface PointerSources {
  controls: ViewportControls
  wallEditing: WallEditing
  interaction: PlanInteraction
  selection: PlanSelection
}

/**
 * A pan gesture takes top priority. Next, an endpoint-drag grab (only possible
 * under the select tool, when a handle is hit) consumes the pointer so it does
 * not also start a marquee or click selection. Otherwise the wall tool and the
 * select-tool selection both see the pointer (each inert under the other's tool).
 */
function composePointerHandlers({
  controls,
  wallEditing,
  interaction,
  selection,
}: PointerSources): ComposedPointerHandlers {
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerDown(event) || wallEditing.onPointerDown(event)) {
        return
      }
      interaction.onPointerDown(event)
      selection.onPointerDown(event)
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerMove(event) || wallEditing.onPointerMove(event)) {
        return
      }
      interaction.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      wallEditing.onPointerUp(event)
      selection.onPointerUp(event)
    },
  }
}

interface PlanScene {
  walls: DrawPlanOptions['walls']
  // The scene graph always supplies rooms, so this is non-optional here even
  // though drawPlan accepts rooms as an optional overlay.
  rooms: NonNullable<DrawPlanOptions['rooms']>
  selectedIds: ReadonlySet<string>
  preview: PreviewSegment | undefined
  snap: SnapResult | null
  marquee: Bounds | undefined
  // The single selected wall under the select tool whose endpoint handles paint,
  // or null when no wall is editable.
  endpointHandles: WallSceneNode | null
  viewport: Viewport
}

/** Redraws the canvas whenever the walls, selection, viewport, preview, snap, marquee, or handles change. */
function usePlanRedraw(canvasRef: RefObject<HTMLCanvasElement | null>, scene: PlanScene): void {
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      return
    }
    drawPlan(ctx, {
      walls: scene.walls,
      rooms: scene.rooms,
      viewport: scene.viewport,
      width: PLAN_WIDTH,
      height: PLAN_HEIGHT,
      selectedIds: scene.selectedIds,
      grid: true,
      rulers: true,
      ...(scene.preview ? { preview: scene.preview } : {}),
      ...(scene.snap ? { snap: scene.snap } : {}),
      ...(scene.marquee ? { marquee: scene.marquee } : {}),
      ...(scene.endpointHandles ? { endpointHandles: scene.endpointHandles } : {}),
    })
  }, [
    canvasRef,
    scene.walls,
    scene.rooms,
    scene.selectedIds,
    scene.preview,
    scene.snap,
    scene.marquee,
    scene.endpointHandles,
    scene.viewport,
  ])
}

interface SceneInputs {
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  selectedWall: WallSceneNode | null
  interaction: PlanInteraction
  planSelection: PlanSelection
  wallEditing: WallEditing
  viewport: Viewport
}

/** Assembles the draw scene from the resolved hooks; the endpoint drag and the wall tool never preview at once. */
function buildScene(inputs: SceneInputs): PlanScene {
  return {
    walls: inputs.graph.walls,
    rooms: inputs.graph.rooms,
    selectedIds: inputs.selectedIds,
    preview: inputs.wallEditing.preview ?? inputs.interaction.preview,
    snap: inputs.interaction.snap,
    marquee: inputs.planSelection.marquee,
    endpointHandles: inputs.selectedWall,
    viewport: inputs.viewport,
  }
}

function planCursor(tool: ToolId, panning: boolean): string {
  if (panning) {
    return 'grabbing'
  }
  return tool === 'draw-wall' ? 'crosshair' : 'default'
}

interface PlanController {
  cursor: string
  pointerHandlers: ComposedPointerHandlers
  onPointerLeave: () => void
}

/**
 * Resolves and composes all the plan-editing hooks (pan/zoom, wall tool, hit-test
 * selection, endpoint-drag wall editing), drives the redraw, and exposes the
 * canvas cursor and pointer handlers. The pure decision logic lives in the tested
 * modules; this binds them to the session, selection, and active tool.
 */
function usePlanController(canvasRef: RefObject<HTMLCanvasElement | null>): PlanController {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selection = useSelection()
  const { tool } = useActiveTool()
  const [viewport, setViewport] = useState<Viewport>({ scale: DEFAULT_PLAN_SCALE })
  const selectedIds = useSelectionIds()
  const selectedWall = singleSelectedWall(tool, selectedIds, graph)
  const interaction = usePlanInteraction({ session, walls: graph.walls, tool, viewport })
  const planSelection = usePlanSelection({ graph, selection, tool, viewport })
  const wallEditing = useWallEditing({ session, selectedWall, walls: graph.walls, viewport })
  const controls = useViewportControls(canvasRef, setViewport)
  useFitToContent({ walls: graph.walls, rooms: graph.rooms, size: PLAN_SIZE }, setViewport)
  const scene = buildScene({
    graph,
    selectedIds,
    selectedWall,
    interaction,
    planSelection,
    wallEditing,
    viewport,
  })
  usePlanRedraw(canvasRef, scene)
  return {
    cursor: planCursor(tool, controls.panning),
    pointerHandlers: composePointerHandlers({
      controls,
      wallEditing,
      interaction,
      selection: planSelection,
    }),
    onPointerLeave: interaction.onPointerLeave,
  }
}

/**
 * The 2D plan editing surface: the Canvas-and-pointer glue binding the tested pure
 * pieces (viewport projection, pan/zoom, grid, rulers, wall tool, hit testing,
 * drawing) to React, the session, the selection store, and the active tool. It is
 * coverage-excluded and validated by the wall-drawing end-to-end spec, since jsdom
 * has no 2D Canvas.
 */
export function PlanView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { cursor, pointerHandlers, onPointerLeave } = usePlanController(canvasRef)

  return (
    <canvas
      ref={canvasRef}
      width={PLAN_WIDTH}
      height={PLAN_HEIGHT}
      aria-label="Floor plan"
      className="plan-view"
      style={{ touchAction: 'none', cursor }}
      onPointerDown={pointerHandlers.onPointerDown}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={pointerHandlers.onPointerUp}
      onPointerLeave={onPointerLeave}
    />
  )
}
