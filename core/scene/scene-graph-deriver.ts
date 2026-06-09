import {
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene-graph'
import type { Floor, Project, RoomOverride, Wall } from '../model/types'
import type { RoomSceneNode, SceneGraph, SceneNode, WallSceneNode } from './scene-graph'

type RoomOverrides = Readonly<Record<string, RoomOverride>> | undefined

/**
 * Cached room nodes plus the `roomOverrides` reference they were built from. A
 * room override (a name or custom polygon) changes the room nodes without
 * changing the floor reference, so keying the room cache on the floor alone
 * would serve stale nodes after an override edit.
 */
interface CachedRoomNodes {
  overrides: RoomOverrides
  nodes: RoomSceneNode[]
}

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
  const roomCache = new WeakMap<Floor, CachedRoomNodes>()

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

  const roomNodesFor = (floor: Floor, overrides: RoomOverrides): RoomSceneNode[] => {
    const cached = roomCache.get(floor)
    if (cached !== undefined && cached.overrides === overrides) {
      return cached.nodes
    }
    const nodes = deriveRoomNodesForFloor(floor, overrides)
    roomCache.set(floor, { overrides, nodes })
    return nodes
  }

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
    rooms: project.floors.flatMap((floor) => roomNodesFor(floor, project.roomOverrides)),
    underlays: project.floors.flatMap((floor) => deriveUnderlayNodesForFloor(floor)),
    openings: project.floors.flatMap((floor) => deriveOpeningNodesForFloor(floor)),
    dimensions: project.floors.flatMap((floor) => deriveDimensionNodesForFloor(floor)),
  })
}
