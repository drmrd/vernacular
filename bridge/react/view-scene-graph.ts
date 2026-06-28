import { FLOOR_NODE_PREFIX, type SceneGraph, type SceneNode } from '../../core'

/** Options controlling which floors the whole-building view includes. */
export interface BuildingViewOptions {
  /** Include floors below grade (negative elevation), such as a basement. */
  includeUnderground: boolean
}

// A floor sits below grade when its finished-floor elevation is under the ground
// datum at 0 mm; basements and sub-basements are placed at negative elevations.
const GROUND_ELEVATION_MM = 0

function floorModelId(node: SceneNode): string {
  return node.id.slice(FLOOR_NODE_PREFIX.length)
}

// The model ids of the floors hidden in this projection: none when underground
// levels are shown, otherwise every floor seated below grade.
function hiddenFloorIds(graph: SceneGraph, options: BuildingViewOptions): Set<string> {
  if (options.includeUnderground) {
    return new Set()
  }
  return new Set(
    graph.nodes
      .filter((node) => node.elevation < GROUND_ELEVATION_MM)
      .map((node) => floorModelId(node)),
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
  }
}
