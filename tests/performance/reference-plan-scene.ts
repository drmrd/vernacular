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

/** What the view toggles show, as `buildDrawOptions` takes it. */
type OverlayVisibility = Parameters<typeof buildDrawOptions>[2]

/**
 * Every view toggle on: the grid and the dimensions. The rulers and room labels have no toggle
 * and are always drawn. Every toggle must be stated as on, so a new toggle fails the type check.
 */
export const ALL_OVERLAYS_SHOWN = {
  showGrid: true,
  showDimensions: true,
} as const satisfies { [Toggle in keyof OverlayVisibility]-?: true }

/** Every toggle on but the dimensions. */
export const DIMENSIONS_HIDDEN = {
  ...ALL_OVERLAYS_SHOWN,
  showDimensions: false,
} as const satisfies Required<OverlayVisibility>

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
 *
 * It mirrors `buildScene` in `editor/plan/plan-view.tsx`, which runs on the hooks of the
 * React component and so cannot be called here. The object satisfies `Required<PlanScene>`,
 * so a member that `PlanScene` gains, optional or not, fails the type check until it is set here.
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
    size: { width: PLAN_WIDTH, height: PLAN_HEIGHT },
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
  } satisfies Required<PlanScene>
}

/** The draw options of one floor, by default with every overlay shown, in the default light palette. */
export function referenceDrawOptions(
  project: Project,
  floor: Floor,
  overlay: OverlayVisibility = ALL_OVERLAYS_SHOWN,
): DrawPlanOptions {
  return buildDrawOptions(referencePlanScene(project, floor), DEFAULT_PLAN_PALETTE, overlay)
}
