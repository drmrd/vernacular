import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  deriveSceneGraph,
  sceneGraphForFloor,
  surfaceKey,
  surfaceTintHex,
  type Floor,
  type Project,
} from '../../core'
import type { DrawPlanOptions } from '../../editor/plan/draw-plan'
import { toDrawableDimensions } from '../../editor/plan/drawable-dimensions'
import { toDrawableFurniture } from '../../editor/plan/drawable-furniture'
import { toDrawableOpenings } from '../../editor/plan/drawable-openings'
import { computeFitViewport, contentBounds, planContentPoints } from '../../editor/plan/fit'
import { DEFAULT_PLAN_PALETTE } from '../../editor/plan/plan-palette'
import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  buildDrawOptions,
  type PlanScene,
} from '../../editor/plan/plan-scene'
import type { Viewport } from '../../editor/plan/viewport'

/** Every view toggle on: the grid and the dimensions. The rulers and room labels are always on. */
const ALL_OVERLAYS_SHOWN = { showGrid: true, showDimensions: true }
const NOTHING_SELECTED: ReadonlySet<string> = new Set()

/** The viewport that the fit action gives for the walls and rooms of a floor, on the plan canvas. */
function fitWholeFloor(walls: PlanScene['walls'], rooms: PlanScene['rooms']): Viewport {
  const bounds = contentBounds(planContentPoints(walls, rooms))
  if (bounds === null) {
    throw new Error('A reference floor has nothing to fit')
  }
  return computeFitViewport(bounds, { width: PLAN_WIDTH, height: PLAN_HEIGHT })
}

function surfacePaintOf(project: Project): PlanScene['surfacePaint'] {
  return {
    treatmentForFace: (wallId, side) =>
      project.paint?.[surfaceKey({ kind: 'wall-face', wallId, side })],
    activeSurface: null,
    highlightedSurface: null,
  }
}

function floorFillColor(project: Project, floor: Floor): string | undefined {
  const treatment = project.paint?.[surfaceKey({ kind: 'floor', floorId: floor.id })]
  return treatment === undefined ? undefined : surfaceTintHex(treatment)
}

/**
 * The plan scene of one floor at rest, as the plan view builds it: the scene graph
 * narrowed to the floor, nothing selected or hovered, no tool gesture in progress,
 * the default preferences for the project units, and the viewport that fits the floor.
 */
export function referencePlanScene(project: Project, floor: Floor): PlanScene {
  const graph = sceneGraphForFloor(deriveSceneGraph(project), floor.id)
  const imperial = project.meta.units === 'imperial'
  return {
    walls: graph.walls,
    rooms: graph.rooms,
    selectedIds: NOTHING_SELECTED,
    hoveredId: undefined,
    preview: undefined,
    snap: null,
    marquee: undefined,
    endpointHandles: null,
    openingResizeHandles: null,
    viewport: fitWholeFloor(graph.walls, graph.rooms),
    preferences: imperial ? DEFAULT_IMPERIAL_PREFERENCES : DEFAULT_METRIC_PREFERENCES,
    underlays: [],
    openings: toDrawableOpenings(graph.openings, NOTHING_SELECTED),
    furniture: toDrawableFurniture(floor.furniture, NOTHING_SELECTED),
    dimensions: toDrawableDimensions(graph.dimensions, NOTHING_SELECTED),
    stairs: graph.stairs,
    calibration: undefined,
    ghost: [],
    surfacePaint: surfacePaintOf(project),
    roomFillColor: floorFillColor(project, floor),
  }
}

/** The draw options of one floor with every overlay shown, in the default light palette. */
export function referenceDrawOptions(project: Project, floor: Floor): DrawPlanOptions {
  return buildDrawOptions(
    referencePlanScene(project, floor),
    DEFAULT_PLAN_PALETTE,
    ALL_OVERLAYS_SHOWN,
  )
}
