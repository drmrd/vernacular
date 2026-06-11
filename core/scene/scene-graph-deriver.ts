import {
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  deriveStairNodes,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene-graph'
import type { Floor, Project, RoomOverride, Stair, Wall } from '../model/types'
import type {
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  StairSceneNode,
  WallSceneNode,
} from './scene-graph'

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
 * Returns the cached value for `key`, deriving and caching it on a miss. Shared
 * by the reference-keyed memos so the deriver closure stays under its line cap.
 */
function memoizeByRef<K extends object, V>(cache: WeakMap<K, V>, key: K, derive: () => V): V {
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const value = derive()
  cache.set(key, value)
  return value
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
  const stairCache = new WeakMap<readonly Stair[], StairSceneNode[]>()

  const floorNodeFor = (floor: Floor) =>
    memoizeByRef(floorCache, floor, () => deriveFloorNode(floor))
  const wallNodeFor = (floor: Floor, wall: Wall) =>
    memoizeByRef(wallCache, wall, () => deriveWallNode(floor, wall))
  const stairNodesFor = (project: Project) =>
    memoizeByRef(stairCache, project.stairs, () => deriveStairNodes(project))

  const roomNodesFor = (floor: Floor, overrides: RoomOverrides): RoomSceneNode[] => {
    const cached = roomCache.get(floor)
    if (cached !== undefined && cached.overrides === overrides) return cached.nodes
    const nodes = deriveRoomNodesForFloor(floor, overrides)
    roomCache.set(floor, { overrides, nodes })
    return nodes
  }

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
    rooms: project.floors.flatMap((floor) => roomNodesFor(floor, project.roomOverrides)),
    underlays: project.floors.flatMap(deriveUnderlayNodesForFloor),
    openings: project.floors.flatMap(deriveOpeningNodesForFloor),
    dimensions: project.floors.flatMap(deriveDimensionNodesForFloor),
    stairs: stairNodesFor(project),
  })
}
