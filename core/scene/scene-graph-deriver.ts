import { deriveFloorNode, deriveRoomNodes, deriveWallNode } from './scene-graph'
import type { Floor, Project, Wall } from '../model/types'
import type { SceneGraph, SceneNode, WallSceneNode } from './scene-graph'

/**
 * Builds a stateful deriver that memoizes each floor's and wall's scene node by
 * the source object's reference. This is the entity-keyed dirty tracking from
 * the design specification, sections 6.1 and 6.10: re-deriving reuses cached
 * nodes for entities whose reference is unchanged and rebuilds only replaced
 * ones. It pairs with the immutable-update handler convention, where an edited
 * floor or wall becomes a new object while untouched ones keep their reference.
 * The WeakMaps are keyed by the source object so dropped entities do not leak.
 */
export function createSceneGraphDeriver(): (project: Project) => SceneGraph {
  const floorCache = new WeakMap<Floor, SceneNode>()
  const wallCache = new WeakMap<Wall, WallSceneNode>()

  const floorNodeFor = (floor: Floor): SceneNode => {
    const cached = floorCache.get(floor)
    if (cached !== undefined) {
      return cached
    }
    const node = deriveFloorNode(floor)
    floorCache.set(floor, node)
    return node
  }

  const wallNodeFor = (floor: Floor, wall: Wall): WallSceneNode => {
    const cached = wallCache.get(wall)
    if (cached !== undefined) {
      return cached
    }
    const node = deriveWallNode(floor, wall)
    wallCache.set(wall, node)
    return node
  }

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
    rooms: project.floors.flatMap(deriveRoomNodes),
  })
}
