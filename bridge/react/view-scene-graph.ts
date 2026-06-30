import {
  DEFAULT_GRADE_ELEVATION_MM,
  FLOOR_NODE_PREFIX,
  sceneGraphForFloor,
  type SceneGraph,
  type SceneNode,
} from '../../core'

/** Options controlling which floors the whole-building view includes. */
export interface BuildingViewOptions {
  /** Include floors below the model grade datum (`gradeElevation`), such as a basement. */
  includeUnderground: boolean
}

function floorModelId(node: SceneNode): string {
  return node.id.slice(FLOOR_NODE_PREFIX.length)
}

// The model ids of the floors hidden in this projection: none when underground
// levels are shown, otherwise every floor seated below the model grade datum.
// Basements and sub-basements are placed at elevations under that datum.
function hiddenFloorIds(graph: SceneGraph, options: BuildingViewOptions): Set<string> {
  if (options.includeUnderground) {
    return new Set()
  }
  const grade = graph.gradeElevation ?? DEFAULT_GRADE_ELEVATION_MM
  return new Set(
    graph.nodes.filter((node) => node.elevation < grade).map((node) => floorModelId(node)),
  )
}

/**
 * Projects the whole building into one scene graph: every floor stacked at its own
 * elevation, the unified counterpart to `sceneGraphForFloor`. With `includeUnderground`
 * false it drops the below-grade floors (a basement) and all of their entities, so the
 * combined model shows only the above-grade massing.
 */
export function sceneGraphForBuilding(graph: SceneGraph, options: BuildingViewOptions): SceneGraph {
  const hidden = hiddenFloorIds(graph, options)
  const onVisibleFloor = (entity: { floorId: string }): boolean => !hidden.has(entity.floorId)
  return {
    nodes: graph.nodes.filter((node) => !hidden.has(floorModelId(node))),
    walls: graph.walls.filter(onVisibleFloor),
    rooms: graph.rooms.filter(onVisibleFloor),
    underlays: graph.underlays.filter(onVisibleFloor),
    openings: graph.openings.filter(onVisibleFloor),
    dimensions: graph.dimensions.filter(onVisibleFloor),
    stairs: graph.stairs.filter(onVisibleFloor),
    furniture: graph.furniture.filter(onVisibleFloor),
    ...(graph.gradeElevation === undefined ? {} : { gradeElevation: graph.gradeElevation }),
  }
}

/** Whether the 3D view shows a single active floor or the whole building stacked. */
export type SceneScope = 'floor' | 'building'

/** The live inputs that decide which scene graph the 3D view renders. */
export interface ViewSceneGraphInput {
  rawGraph: SceneGraph
  scope: SceneScope
  activeFloorId: string | null
  includeUnderground: boolean
}

/**
 * Selects the scene graph the 3D view renders: the active floor on its own in floor
 * scope, or the whole building stacked at its elevations in building scope (with the
 * underground floors dropped when `includeUnderground` is false).
 */
export function viewSceneGraph(input: ViewSceneGraphInput): SceneGraph {
  if (input.scope === 'building') {
    return sceneGraphForBuilding(input.rawGraph, {
      includeUnderground: input.includeUnderground,
    })
  }
  return sceneGraphForFloor(input.rawGraph, input.activeFloorId)
}
