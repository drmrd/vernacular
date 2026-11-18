import { openingRoomSide, withRoomSide } from './opening-room-side'
import {
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveFurnitureNode,
  deriveOpeningNode,
  deriveRoomNodesForFloor,
  deriveStairNodes,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene-graph'
import { resolveGradeElevation } from '../model/site'
import type {
  Floor,
  FurnitureInstance,
  Opening,
  Project,
  RoomOverride,
  Stair,
  Wall,
} from '../model/types'
import type {
  FurnitureSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  StairSceneNode,
  WallSceneNode,
} from './scene-graph'

type RoomOverrides = Readonly<Record<string, RoomOverride>> | undefined

/**
 * Cached room nodes plus the inputs they were built from. The room cache is
 * keyed on `floor.walls`, not the floor, so an edit that yields a new `Floor`
 * but keeps the same walls array (such as an opening edit) reuses the rooms.
 * Two inputs are not captured by the walls key and so are compared explicitly:
 * the `roomOverrides` reference (a name or custom polygon changes the nodes
 * without changing the walls) and `defaultCeilingHeight` (the ceiling-height
 * command spreads the floor and keeps the same walls array, so the ceiling
 * fallback must be compared to avoid serving stale heights).
 */
interface CachedRoomNodes {
  overrides: RoomOverrides
  defaultCeilingHeight: number
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

/** The opening node plus the host-wall reference and the room nodes it was derived against. */
interface CachedOpeningNode {
  hostWall: Wall
  rooms: readonly RoomSceneNode[]
  node: OpeningSceneNode
}

/**
 * Whether the cached node's room side still holds. The same room-node array means nothing moved;
 * otherwise the side is read again, and the new array is remembered when the side is unchanged.
 */
function roomSideHolds(cached: CachedOpeningNode, rooms: readonly RoomSceneNode[]): boolean {
  if (cached.rooms === rooms) {
    return true
  }
  const holds = openingRoomSide(cached.node, rooms) === cached.node.roomSide
  if (holds) {
    cached.rooms = rooms
  }
  return holds
}

/**
 * Derives a floor's opening nodes. Reuses a cached node only while the Opening and its host Wall
 * references are unchanged AND the opening's room side is unchanged: the floor's room-node array is
 * the same reference as when the node was cached, or openingRoomSide(cachedNode, rooms) still
 * equals cachedNode.roomSide (then the new array is remembered). Otherwise it derives a new node,
 * so a view that reuses a 3D group by node reference rebuilds a window exactly when its side
 * changes. A replaced host wall changes the opening geometry without changing the opening
 * reference, so the cache compares the host wall too. Module-scope so the deriver closure stays
 * under its line cap, like `memoizeByRef`.
 */
function openingNodesFor(
  openingCache: WeakMap<Opening, CachedOpeningNode>,
  floor: Floor,
  rooms: readonly RoomSceneNode[],
): OpeningSceneNode[] {
  return floor.openings.flatMap((opening) => {
    const hostWall = floor.walls.find((wall) => wall.id === opening.hostWallId)
    if (hostWall === undefined) {
      return []
    }
    const cached = openingCache.get(opening)
    if (cached !== undefined && cached.hostWall === hostWall && roomSideHolds(cached, rooms)) {
      return [cached.node]
    }
    const node = withRoomSide(deriveOpeningNode(floor, opening, hostWall), rooms)
    openingCache.set(opening, { hostWall, rooms, node })
    return [node]
  })
}

/**
 * Derives a floor's room nodes, reusing the cached nodes while the floor's walls
 * array, the `overrides` reference, and `defaultCeilingHeight` are all unchanged.
 * Keying on `floor.walls` lets an edit that yields a new floor with the same
 * walls (an opening edit) reuse the rooms, while an override edit or a ceiling
 * height change still rebuilds them. Module-scope so the deriver closure stays
 * under its line cap, like `openingNodesFor`.
 */
function roomNodesFor(
  roomCache: WeakMap<readonly Wall[], CachedRoomNodes>,
  floor: Floor,
  overrides: RoomOverrides,
): RoomSceneNode[] {
  const cached = roomCache.get(floor.walls)
  if (
    cached !== undefined &&
    cached.overrides === overrides &&
    cached.defaultCeilingHeight === floor.defaultCeilingHeight
  ) {
    return cached.nodes
  }
  const nodes = deriveRoomNodesForFloor(floor, overrides)
  roomCache.set(floor.walls, { overrides, defaultCeilingHeight: floor.defaultCeilingHeight, nodes })
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
  const roomCache = new WeakMap<readonly Wall[], CachedRoomNodes>()
  const stairCache = new WeakMap<readonly Stair[], StairSceneNode[]>()
  const openingCache = new WeakMap<Opening, CachedOpeningNode>()
  const furnitureCache = new WeakMap<FurnitureInstance, FurnitureSceneNode>()

  const floorNodeFor = (floor: Floor) =>
    memoizeByRef(floorCache, floor, () => deriveFloorNode(floor))
  const wallNodeFor = (floor: Floor, wall: Wall) =>
    memoizeByRef(wallCache, wall, () => deriveWallNode(floor, wall))
  const stairNodesFor = (project: Project) =>
    memoizeByRef(stairCache, project.stairs, () => deriveStairNodes(project))
  const furnitureNodesFor = (floor: Floor): FurnitureSceneNode[] =>
    floor.furniture.map((item) =>
      memoizeByRef(furnitureCache, item, () => deriveFurnitureNode(floor, item)),
    )

  return (project) => {
    const roomsByFloor = project.floors.map((floor) =>
      roomNodesFor(roomCache, floor, project.roomOverrides),
    )
    return {
      nodes: project.floors.map(floorNodeFor),
      walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
      rooms: roomsByFloor.flat(),
      underlays: project.floors.flatMap(deriveUnderlayNodesForFloor),
      openings: project.floors.flatMap((floor, index) =>
        openingNodesFor(openingCache, floor, roomsByFloor[index] ?? []),
      ),
      dimensions: project.floors.flatMap(deriveDimensionNodesForFloor),
      stairs: stairNodesFor(project),
      furniture: project.floors.flatMap(furnitureNodesFor),
      gradeElevation: resolveGradeElevation(project.site),
    }
  }
}
