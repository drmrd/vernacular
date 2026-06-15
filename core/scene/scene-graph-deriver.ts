import {
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveOpeningNode,
  deriveRoomNodesForFloor,
  deriveStairNodes,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene-graph'
import type { Floor, Opening, Project, RoomOverride, Stair, Wall } from '../model/types'
import type {
  OpeningSceneNode,
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

/** The opening node plus the host-wall reference it was derived against. */
interface CachedOpeningNode {
  hostWall: Wall
  node: OpeningSceneNode
}

/**
 * Derives a floor's opening nodes, reusing each cached node while both its
 * source `Opening` reference and its host wall reference are unchanged. A
 * replaced host wall changes the opening geometry without changing the opening
 * reference, so the cache compares the host wall too. Module-scope so the
 * deriver closure stays under its line cap, like `memoizeByRef`.
 */
function openingNodesFor(
  openingCache: WeakMap<Opening, CachedOpeningNode>,
  floor: Floor,
): OpeningSceneNode[] {
  return floor.openings.flatMap((opening) => {
    const hostWall = floor.walls.find((wall) => wall.id === opening.hostWallId)
    if (hostWall === undefined) {
      return []
    }
    const cached = openingCache.get(opening)
    if (cached !== undefined && cached.hostWall === hostWall) {
      return [cached.node]
    }
    const node = deriveOpeningNode(floor, opening, hostWall)
    openingCache.set(opening, { hostWall, node })
    return [node]
  })
}

/**
 * Derives a floor's room nodes, reusing the cached nodes while both the source
 * `Floor` reference and the `overrides` reference are unchanged. A room override
 * edit replaces the overrides reference without changing the floor reference, so
 * the cache compares the overrides too. Module-scope so the deriver closure
 * stays under its line cap, like `openingNodesFor`.
 */
function roomNodesFor(
  roomCache: WeakMap<Floor, CachedRoomNodes>,
  floor: Floor,
  overrides: RoomOverrides,
): RoomSceneNode[] {
  const cached = roomCache.get(floor)
  if (cached !== undefined && cached.overrides === overrides) return cached.nodes
  const nodes = deriveRoomNodesForFloor(floor, overrides)
  roomCache.set(floor, { overrides, nodes })
  return nodes
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
  const openingCache = new WeakMap<Opening, CachedOpeningNode>()

  const floorNodeFor = (floor: Floor) =>
    memoizeByRef(floorCache, floor, () => deriveFloorNode(floor))
  const wallNodeFor = (floor: Floor, wall: Wall) =>
    memoizeByRef(wallCache, wall, () => deriveWallNode(floor, wall))
  const stairNodesFor = (project: Project) =>
    memoizeByRef(stairCache, project.stairs, () => deriveStairNodes(project))

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
    rooms: project.floors.flatMap((floor) => roomNodesFor(roomCache, floor, project.roomOverrides)),
    underlays: project.floors.flatMap(deriveUnderlayNodesForFloor),
    openings: project.floors.flatMap((floor) => openingNodesFor(openingCache, floor)),
    dimensions: project.floors.flatMap(deriveDimensionNodesForFloor),
    stairs: stairNodesFor(project),
  })
}
