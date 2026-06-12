/* eslint-disable max-lines -- the plan composition root: it aggregates every plan-editing hook, the
   redraw scene shape, and the draw-options builder. The pieces are already extracted into use-* hooks
   and pure builders, so the residual length is irreducible composition glue, not a missing extraction. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  sceneGraphForFloor,
  type Point,
  type SceneGraph,
  type UnitPreferences,
  type UnitSystem,
  type WallSceneNode,
} from '../../core'
import {
  createClipboardStore,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
  type ClipboardStore,
  type SelectionStore,
} from '../../bridge'
import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import type { DrawableDimension } from './draw-dimension'
import { drawPlan, type DrawPlanOptions, type PreviewSegment } from './draw-plan'
import type { DrawableOpening } from './draw-opening'
import type { DrawableUnderlay } from './draw-underlay'
import { toDrawableDimensions } from './drawable-dimensions'
import { singleSelectedWall } from './selected-wall'
import { composePointerHandlers, type ComposedPointerHandlers } from './compose-pointer-handlers'
import { useDimensionTool, type DimensionTool } from './use-dimension-tool'
import { useOpeningLayer, type OpeningLayer } from './use-opening-layer'
import {
  usePlanInteraction,
  type PlanInteraction,
  type PlanInteractionDeps,
} from './use-plan-interaction'
import { usePlanUnderlayLayer, type PlanUnderlayLayer } from './use-underlay'
import { underlayTracePoints } from './underlay-trace-points'
import { PlanOverlay, type PlanOverlayProps } from './plan-overlay'
import { usePlanSelection, type PlanSelection } from './use-plan-selection'
import { useSurfacePaintLayer } from './use-surface-paint-layer'
import { useSelectionKeyboard } from './use-selection-keyboard'
import { useSelectionMove, type SelectionMove } from './use-selection-move'
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

type CanvasRef = RefObject<HTMLCanvasElement | null>

// A project-level unit-preferences store is later work; this slice picks the
// default preferences for the project's units (see the slice deferrals).
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
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
  dimensions: readonly DrawableDimension[]
  // Stairs drawn over the room fills and beneath the wall strokes.
  stairs: NonNullable<DrawPlanOptions['stairs']>
  // The live calibration measurement segment, or undefined when not measuring.
  calibration: PreviewSegment | undefined
  // The translated ghost of the selection during a move-drag, empty otherwise.
  ghost: readonly PreviewSegment[]
  // The per-face treatment lookup and active surface the plan renders as paint
  // bands and a highlight beneath the wall strokes.
  surfacePaint: NonNullable<DrawPlanOptions['surfacePaint']>
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
    dimensions: scene.dimensions,
    stairs: scene.stairs,
    surfacePaint: scene.surfacePaint,
    ...(scene.preview ? { preview: scene.preview } : {}),
    ...(scene.snap ? { snap: scene.snap } : {}),
    ...(scene.marquee ? { marquee: scene.marquee } : {}),
    ...(scene.endpointHandles ? { endpointHandles: scene.endpointHandles } : {}),
    ...(scene.calibration ? { calibration: scene.calibration } : {}),
    ...(scene.ghost.length > 0 ? { ghost: scene.ghost } : {}),
  }
}

/**
 * Redraws the canvas whenever any draw-meaningful scene leaf changes. The effect
 * depends on each leaf member individually rather than on the per-render scene
 * object, which would rasterize on every render; the scene members are listed
 * explicitly because exhaustive-deps cannot infer them through buildDrawOptions.
 */
function usePlanRedraw(canvasRef: CanvasRef, scene: PlanScene): void {
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
    scene.dimensions,
    scene.stairs,
    scene.calibration,
    scene.ghost,
    scene.surfacePaint,
  ])
}

const CROSSHAIR_TOOLS: ReadonlySet<ToolId> = new Set([
  'draw-wall',
  'calibrate',
  'place-opening',
  'dimension',
])

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
  selection: SelectionStore
  interaction: PlanInteraction
  dimensionTool: DimensionTool
  dimensions: readonly DrawableDimension[]
  planSelection: PlanSelection
  selectionMove: SelectionMove
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
function buildScene(
  inputs: PlanLayers,
  surfacePaint: NonNullable<DrawPlanOptions['surfacePaint']>,
): PlanScene {
  const { graph, interaction, dimensionTool, planSelection } = inputs
  const { wallEditing, underlayLayer, openingLayer } = inputs
  return {
    walls: graph.walls,
    rooms: graph.rooms,
    selectedIds: inputs.selectedIds,
    // The endpoint drag, the wall tool, and the dimension tool never preview at
    // once (each gated on its own tool), so one resolved preview leaf covers all.
    preview: wallEditing.preview ?? interaction.preview ?? dimensionTool.preview,
    snap: interaction.snap,
    marquee: planSelection.marquee,
    endpointHandles: inputs.selectedWall,
    viewport: inputs.viewport,
    preferences: inputs.preferences,
    underlays: underlayLayer.underlays,
    openings: openingLayer.drawables,
    dimensions: inputs.dimensions,
    stairs: graph.stairs,
    calibration: underlayLayer.calibration.calibration,
    ghost: inputs.selectionMove.ghost,
    surfacePaint,
  }
}

interface PlanController {
  cursor: string
  pointerHandlers: ComposedPointerHandlers
  overlay: PlanOverlayProps
}

/**
 * The visible underlays' footprint corners that the wall tool can snap to in
 * trace mode, or undefined when trace mode is off so snapping is byte-for-byte
 * unchanged.
 */
function floorTracePoints(graph: SceneGraph, traceMode: boolean): readonly Point[] | undefined {
  return traceMode
    ? graph.underlays.filter((underlay) => underlay.visible).flatMap(underlayTracePoints)
    : undefined
}

/**
 * Builds the wall-tool interaction deps, spreading trace points in only when
 * trace mode produced some so the field stays absent under
 * exactOptionalPropertyTypes when off.
 */
function planInteractionDeps(
  base: Omit<PlanInteractionDeps, 'walls' | 'tracePoints'>,
  graph: SceneGraph,
  traceMode: boolean,
): PlanInteractionDeps {
  const tracePoints = floorTracePoints(graph, traceMode)
  return { ...base, walls: graph.walls, ...(tracePoints ? { tracePoints } : {}) }
}

/**
 * The in-app clipboard backing copy/cut/paste; created once and held for the
 * session, mirroring the bridge-owned selection store (it stays outside undo).
 * The ref starts null and is lazily filled on first render, so the store is
 * never rebuilt on a re-render; the returned value is non-null from here on.
 */
function useClipboardStore(): ClipboardStore {
  const clipboardRef = useRef<ClipboardStore | null>(null)
  clipboardRef.current ??= createClipboardStore()
  return clipboardRef.current
}

/** The scene graph narrowed to the active floor, so downstream layers see only it. */
function useActiveFloorGraph(): SceneGraph {
  const fullGraph = useSceneGraph()
  const floorId = useActiveFloorId()
  return useMemo(() => sceneGraphForFloor(fullGraph, floorId), [fullGraph, floorId])
}

/**
 * Resolves all the plan-editing hooks (pan/zoom, wall tool, hit-test selection,
 * endpoint-drag wall editing, underlay layer, calibration, opening layer) plus the
 * active unit preferences into the flat layer set the scene and pointer handlers
 * consume. The pure decision logic lives in the tested modules; this binds them to
 * the session, selection, active tool, and viewport.
 */
function usePlanLayers(canvasRef: CanvasRef, traceMode: boolean): PlanLayers {
  const session = useEditorSession()
  const graph = useActiveFloorGraph()
  const selection = useSelection()
  const { tool } = useActiveTool()
  const [viewport, setViewport] = useState<Viewport>({ scale: DEFAULT_PLAN_SCALE })
  const selectedIds = useSelectionIds()
  const selectedWall = singleSelectedWall(tool, selectedIds, graph)
  const deps = planInteractionDeps({ session, tool, viewport }, graph, traceMode)
  const interaction = usePlanInteraction(deps)
  const dimensionTool = useDimensionTool({ session, tool, viewport })
  const planSelection = usePlanSelection({ graph, selection, tool, viewport })
  const clipboard = useClipboardStore()
  const selectionMove = useSelectionMove({ session, graph, selectedIds, tool, viewport })
  useSelectionKeyboard({ session, selection, clipboard, selectedIds, tool })
  const wallEditing = useWallEditing({ session, selectedWall, walls: graph.walls, viewport })
  const controls = useViewportControls(canvasRef, setViewport)
  useFitToContent({ walls: graph.walls, rooms: graph.rooms, size: PLAN_SIZE }, setViewport)
  const underlayLayer = usePlanUnderlayLayer({ session, graph, tool, viewport })
  const openingLayer = useOpeningLayer({ session, graph, tool, viewport, selectedIds })
  return {
    graph,
    tool,
    selectedIds,
    selectedWall,
    viewport,
    preferences: PREFERENCES_BY_UNITS[session.getProject().meta.units],
    selection,
    interaction,
    dimensionTool,
    dimensions: toDrawableDimensions(graph.dimensions, selectedIds),
    planSelection,
    selectionMove,
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
function usePlanController(canvasRef: CanvasRef, traceMode: boolean): PlanController {
  const layers = usePlanLayers(canvasRef, traceMode)
  const surfacePaint = useSurfacePaintLayer()
  usePlanRedraw(canvasRef, buildScene(layers, surfacePaint))
  const { controls, wallEditing, interaction, dimensionTool, planSelection } = layers
  const { underlayLayer, openingLayer, selectionMove } = layers
  return {
    cursor: planCursor(layers.tool, controls.panning),
    pointerHandlers: composePointerHandlers({
      controls,
      wallEditing,
      openingEditing: openingLayer.editing,
      selectionMove,
      interaction,
      dimensionTool,
      calibration: underlayLayer.calibration,
      selection: planSelection,
      openingPlacement: openingLayer.placement,
    }),
    overlay: {
      viewport: layers.viewport,
      graph: layers.graph,
      selectedIds: layers.selectedIds,
      selection: layers.selection,
      preferences: layers.preferences,
      snap: interaction.snap,
    },
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
  const [traceMode, setTraceMode] = useState(false)
  const { cursor, pointerHandlers, overlay } = usePlanController(canvasRef, traceMode)

  // The stage is a positioned wrapper sized to the Canvas so the absolutely
  // positioned overlay (inset: 0) registers exactly over it. The canvas element,
  // its aria-label, and its pointer handlers are unchanged from before the overlay.
  return (
    <div className="plan-stage" style={{ width: PLAN_WIDTH, height: PLAN_HEIGHT }}>
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
      <label className="plan-trace-toggle">
        <input
          type="checkbox"
          checked={traceMode}
          onChange={(event) => setTraceMode(event.target.checked)}
        />{' '}
        Trace underlay
      </label>
      <PlanOverlay {...overlay} />
    </div>
  )
}
