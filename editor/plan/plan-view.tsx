import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import { useEditorSession, useSceneGraph, useSelection, useSelectionIds } from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import type { DrawableOpening } from './draw-opening'
import type { DrawableUnderlay } from './draw-underlay'
import { singleSelectedWall } from './selected-wall'
import type { OpeningPlacement } from './use-opening-placement'
import type { OpeningEditing } from './use-opening-editing'
import { useOpeningLayer, type OpeningLayer } from './use-opening-layer'
import { usePlanInteraction, type PlanInteraction } from './use-plan-interaction'
import { usePlanUnderlayLayer, type PlanUnderlayLayer } from './use-underlay'
import { usePlanSelection, type PlanSelection } from './use-plan-selection'
import { useWallEditing, type WallEditing } from './use-wall-editing'
import {
  useFitToContent,
  useViewportControls,
  type ViewportControls,
} from './use-viewport-controls'
import type { SnapResult } from './snap'
import { DEFAULT_PLAN_SCALE, type Viewport } from './viewport'

const PLAN_WIDTH = 800
const PLAN_HEIGHT = 600
const PLAN_SIZE = { width: PLAN_WIDTH, height: PLAN_HEIGHT }

// A project-level unit-preferences store is later work; this slice picks the
// default preferences for the project's units (see the slice deferrals).
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
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
  openingEditing: OpeningEditing
  interaction: PlanInteraction
  calibration: PlanUnderlayLayer['calibration']
  selection: PlanSelection
  openingPlacement: OpeningPlacement
}

/**
 * A pan gesture takes top priority. Next, an endpoint-drag grab or an opening
 * footprint grab (both only possible under the select tool, when the pointer is
 * over a handle or footprint) consumes the pointer so it does not also start a
 * marquee or click selection. The calibration interaction runs next but is inert
 * unless the calibrate tool is active. Otherwise the wall tool, the place-opening
 * tool, and the select-tool selection all see the pointer, each inert under the
 * others' tool.
 */
function composePointerHandlers(sources: PointerSources): ComposedPointerHandlers {
  const { controls, wallEditing, openingEditing, interaction } = sources
  const { calibration, selection, openingPlacement } = sources
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerDown(event) || wallEditing.onPointerDown(event)) {
        return
      }
      if (openingEditing.onPointerDown(event)) {
        return
      }
      calibration.onPointerDown(event)
      interaction.onPointerDown(event)
      openingPlacement.onPointerDown(event)
      selection.onPointerDown(event)
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (controls.onPanPointerMove(event) || wallEditing.onPointerMove(event)) {
        return
      }
      if (openingEditing.onPointerMove(event)) {
        return
      }
      calibration.onPointerMove(event)
      interaction.onPointerMove(event)
      selection.onPointerMove(event)
    },
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
      controls.onPanPointerUp(event)
      wallEditing.onPointerUp(event)
      openingEditing.onPointerUp(event)
      selection.onPointerUp(event)
    },
    // Clear both the wall-tool and calibration cursors when the pointer leaves.
    onPointerLeave: () => {
      interaction.onPointerLeave()
      calibration.onPointerLeave()
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
  marquee: DrawPlanOptions['marquee']
  // The single selected wall under the select tool whose endpoint handles paint,
  // or null when no wall is editable.
  endpointHandles: WallSceneNode | null
  viewport: Viewport
  // The active unit preferences that format the room-label area text.
  preferences: UnitPreferences
  underlays: readonly DrawableUnderlay[]
  openings: readonly DrawableOpening[]
  // The live calibration measurement segment, or undefined when not measuring.
  calibration: PreviewSegment | undefined
}

/**
 * Assembles the drawPlan options from the flattened scene leaves. Optional
 * overlays (preview, snap, marquee, endpoint handles, calibration) are spread in
 * only when present so an absent one stays off under exactOptionalPropertyTypes.
 */
function buildDrawOptions(scene: PlanScene): DrawPlanOptions {
  return {
    walls: scene.walls,
    rooms: scene.rooms,
    viewport: scene.viewport,
    width: PLAN_WIDTH,
    height: PLAN_HEIGHT,
    selectedIds: scene.selectedIds,
    grid: true,
    rulers: true,
    roomLabels: { preferences: scene.preferences },
    underlays: scene.underlays,
    openings: scene.openings,
    ...(scene.preview ? { preview: scene.preview } : {}),
    ...(scene.snap ? { snap: scene.snap } : {}),
    ...(scene.marquee ? { marquee: scene.marquee } : {}),
    ...(scene.endpointHandles ? { endpointHandles: scene.endpointHandles } : {}),
    ...(scene.calibration ? { calibration: scene.calibration } : {}),
  }
}

/**
 * Redraws the canvas whenever any draw-meaningful scene leaf changes. The effect
 * depends on each leaf member individually rather than on the per-render scene
 * object, which would rasterize on every render; the scene members are listed
 * explicitly because exhaustive-deps cannot infer them through buildDrawOptions.
 */
function usePlanRedraw(canvasRef: RefObject<HTMLCanvasElement | null>, scene: PlanScene): void {
  const options = buildDrawOptions(scene)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      drawPlan(ctx, options)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leaf deps, not `options`/`scene`
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
    scene.preferences,
    scene.underlays,
    scene.openings,
    scene.calibration,
  ])
}

const CROSSHAIR_TOOLS: ReadonlySet<ToolId> = new Set(['draw-wall', 'calibrate', 'place-opening'])

function planCursor(tool: ToolId, panning: boolean): string {
  if (panning) {
    return 'grabbing'
  }
  return CROSSHAIR_TOOLS.has(tool) ? 'crosshair' : 'default'
}

interface PlanLayers {
  graph: SceneGraph
  tool: ToolId
  selectedIds: ReadonlySet<string>
  selectedWall: WallSceneNode | null
  viewport: Viewport
  preferences: UnitPreferences
  interaction: PlanInteraction
  planSelection: PlanSelection
  wallEditing: WallEditing
  controls: ViewportControls
  underlayLayer: PlanUnderlayLayer
  openingLayer: OpeningLayer
}

/**
 * Flattens the resolved hooks into the draw-meaningful scene leaves the redraw
 * depends on. A pure transform (no hooks) so the effect lists each leaf instead
 * of the per-render hook-result objects. The endpoint drag and the wall tool
 * never preview at once, so a single resolved preview leaf covers both.
 */
function buildScene(inputs: PlanLayers): PlanScene {
  const { graph, interaction, planSelection, wallEditing, underlayLayer, openingLayer } = inputs
  return {
    walls: graph.walls,
    rooms: graph.rooms,
    selectedIds: inputs.selectedIds,
    preview: wallEditing.preview ?? interaction.preview,
    snap: interaction.snap,
    marquee: planSelection.marquee,
    endpointHandles: inputs.selectedWall,
    viewport: inputs.viewport,
    preferences: inputs.preferences,
    underlays: underlayLayer.underlays,
    openings: openingLayer.drawables,
    calibration: underlayLayer.calibration.calibration,
  }
}

interface PlanController {
  cursor: string
  pointerHandlers: ComposedPointerHandlers
}

/**
 * Resolves all the plan-editing hooks (pan/zoom, wall tool, hit-test selection,
 * endpoint-drag wall editing, underlay layer, calibration, opening layer) plus the
 * active unit preferences into the flat layer set the scene and pointer handlers
 * consume. The pure decision logic lives in the tested modules; this binds them to
 * the session, selection, active tool, and viewport.
 */
function usePlanLayers(canvasRef: RefObject<HTMLCanvasElement | null>): PlanLayers {
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
  const openingLayer = useOpeningLayer({ session, graph, tool, viewport, selectedIds })
  return {
    graph,
    tool,
    selectedIds,
    selectedWall,
    viewport,
    preferences,
    interaction,
    planSelection,
    wallEditing,
    controls,
    underlayLayer,
    openingLayer,
  }
}

/**
 * Composes the resolved plan layers into the redraw, the canvas cursor, and the
 * pointer handlers. Coverage-excluded glue validated by the wall-drawing
 * end-to-end spec, since jsdom has no 2D Canvas.
 */
function usePlanController(canvasRef: RefObject<HTMLCanvasElement | null>): PlanController {
  const layers = usePlanLayers(canvasRef)
  usePlanRedraw(canvasRef, buildScene(layers))
  const { controls, wallEditing, interaction, planSelection, underlayLayer, openingLayer } = layers
  return {
    cursor: planCursor(layers.tool, controls.panning),
    pointerHandlers: composePointerHandlers({
      controls,
      wallEditing,
      openingEditing: openingLayer.editing,
      interaction,
      calibration: underlayLayer.calibration,
      selection: planSelection,
      openingPlacement: openingLayer.placement,
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
