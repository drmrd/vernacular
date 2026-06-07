import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  type Point,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import {
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
  type EditorSession,
} from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import { singleSelectedWall } from './selected-wall'
import { usePlanUnderlayLayer, type PlanUnderlayLayer } from './use-underlay'
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

// A project-level unit-preferences store is later work; this slice picks the
// default preferences for the project's units (see the slice deferrals).
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

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
  onPointerLeave: () => void
}

interface PointerSources {
  controls: ViewportControls
  wallEditing: WallEditing
  interaction: PlanInteraction
  calibration: PlanUnderlayLayer['calibration']
  selection: PlanSelection
}

/**
 * A pan gesture takes top priority. Next, an endpoint-drag grab (only possible
 * under the select tool, when a handle is hit) consumes the pointer so it does
 * not also start a marquee or click selection. The calibration interaction runs
 * next but is inert unless the calibrate tool is active. Otherwise the wall tool
 * and the select-tool selection both see the pointer (each inert under the
 * other's tool).
 */
function composePointerHandlers({
  controls,
  wallEditing,
  interaction,
  calibration,
  selection,
}: PointerSources): ComposedPointerHandlers {
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerDown(event) || wallEditing.onPointerDown(event)) {
        return
      }
      calibration.onPointerDown(event)
      interaction.onPointerDown(event)
      selection.onPointerDown(event)
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerMove(event) || wallEditing.onPointerMove(event)) {
        return
      }
      calibration.onPointerMove(event)
      interaction.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      wallEditing.onPointerUp(event)
      selection.onPointerUp(event)
    },
    // Clear both the wall-tool and calibration cursors when the pointer leaves.
    onPointerLeave: () => {
      interaction.onPointerLeave()
      calibration.onPointerLeave()
    },
  }
}

interface SceneInputs {
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  selectedWall: WallSceneNode | null
  interaction: PlanInteraction
  planSelection: PlanSelection
  wallEditing: WallEditing
  viewport: Viewport
  preferences: UnitPreferences
  underlayLayer: PlanUnderlayLayer
}

/**
 * Assembles the drawPlan options from the resolved hooks; the endpoint drag and
 * the wall tool never preview at once. Optional overlays (preview, snap, marquee,
 * endpoint handles, calibration) are spread in only when present so an absent one
 * stays off under exactOptionalPropertyTypes.
 */
function buildDrawOptions(inputs: SceneInputs): DrawPlanOptions {
  const preview = inputs.wallEditing.preview ?? inputs.interaction.preview
  const { snap } = inputs.interaction
  const { marquee } = inputs.planSelection
  const calibration = inputs.underlayLayer.calibration.calibration
  return {
    walls: inputs.graph.walls,
    rooms: inputs.graph.rooms,
    viewport: inputs.viewport,
    width: PLAN_WIDTH,
    height: PLAN_HEIGHT,
    selectedIds: inputs.selectedIds,
    grid: true,
    rulers: true,
    roomLabels: { preferences: inputs.preferences },
    underlays: inputs.underlayLayer.underlays,
    ...(preview ? { preview } : {}),
    ...(snap ? { snap } : {}),
    ...(marquee ? { marquee } : {}),
    ...(inputs.selectedWall ? { endpointHandles: inputs.selectedWall } : {}),
    ...(calibration ? { calibration } : {}),
  }
}

/** Redraws the canvas whenever a resolved scene input changes. */
function usePlanRedraw(canvasRef: RefObject<HTMLCanvasElement | null>, inputs: SceneInputs): void {
  const { graph, selectedIds, selectedWall, interaction, planSelection } = inputs
  const { wallEditing, viewport, preferences, underlayLayer } = inputs
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      drawPlan(
        ctx,
        buildDrawOptions({
          graph,
          selectedIds,
          selectedWall,
          interaction,
          planSelection,
          wallEditing,
          viewport,
          preferences,
          underlayLayer,
        }),
      )
    }
  }, [
    canvasRef,
    graph,
    selectedIds,
    selectedWall,
    interaction,
    planSelection,
    wallEditing,
    viewport,
    preferences,
    underlayLayer,
  ])
}

function planCursor(tool: ToolId, panning: boolean): string {
  if (panning) {
    return 'grabbing'
  }
  return tool === 'draw-wall' || tool === 'calibrate' ? 'crosshair' : 'default'
}

interface PlanController {
  cursor: string
  pointerHandlers: ComposedPointerHandlers
}

/**
 * Resolves and composes all the plan-editing hooks (pan/zoom, wall tool, hit-test
 * selection, endpoint-drag wall editing, underlay layer, calibration), drives the
 * redraw, and exposes the canvas cursor and pointer handlers. The pure decision
 * logic lives in the tested modules; this binds them to the session, selection,
 * active tool, and underlay state.
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
  const preferences = PREFERENCES_BY_UNITS[session.getProject().meta.units]
  const underlayLayer = usePlanUnderlayLayer({ session, graph, tool, viewport })
  usePlanRedraw(canvasRef, {
    graph,
    selectedIds,
    selectedWall,
    interaction,
    planSelection,
    wallEditing,
    viewport,
    preferences,
    underlayLayer,
  })
  return {
    cursor: planCursor(tool, controls.panning),
    pointerHandlers: composePointerHandlers({
      controls,
      wallEditing,
      interaction,
      calibration: underlayLayer.calibration,
      selection: planSelection,
    }),
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
  const { cursor, pointerHandlers } = usePlanController(canvasRef)

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
      onPointerLeave={pointerHandlers.onPointerLeave}
    />
  )
}
