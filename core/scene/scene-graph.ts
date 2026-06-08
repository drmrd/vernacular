import type { AssetReference } from '../model/asset-reference'
import type {
  Floor,
  Opening,
  OpeningOrientation,
  Point,
  Project,
  RoomOverride,
  Underlay,
  UnderlayPlacement,
  Wall,
} from '../model/types'
import { deriveOpeningGeometry } from '../topology/openings'
import { applyRoomOverrides, deriveRooms } from '../topology/rooms'

// Kind-prefixed ids keep node ids globally unique within the scene graph.
const FLOOR_NODE_PREFIX = 'floor:'
export const WALL_NODE_PREFIX = 'wall:'
export const UNDERLAY_NODE_PREFIX = 'underlay:'
export const OPENING_NODE_PREFIX = 'opening:'

export interface SceneNode {
  id: string
  kind: 'floor'
  name: string
  elevation: number
}

export interface WallSceneNode {
  id: string
  kind: 'wall'
  floorId: string
  start: Point
  end: Point
  thickness: number
}

export interface RoomSceneNode {
  id: string
  kind: 'room'
  floorId: string
  polygon: Point[]
  area: number
  name?: string
}

export interface UnderlaySceneNode {
  id: string
  kind: 'underlay'
  floorId: string
  image: AssetReference
  width: number
  height: number
  placement: UnderlayPlacement
  opacity: number
  visible: boolean
}

export interface OpeningSceneNode {
  id: string
  kind: 'opening'
  floorId: string
  /** ElementType id, category 'opening'. */
  type: string
  center: Point
  along: Point
  normal: Point
  width: number
  height: number
  sillHeight: number
  hostThickness: number
  orientation: OpeningOrientation
}

export interface SceneGraph {
  nodes: SceneNode[]
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  underlays: UnderlaySceneNode[]
  openings: OpeningSceneNode[]
}

export function deriveFloorNode(floor: Floor): SceneNode {
  return {
    id: `${FLOOR_NODE_PREFIX}${floor.id}`,
    kind: 'floor',
    name: floor.name,
    elevation: floor.elevation,
  }
}

export function deriveWallNode(floor: Floor, wall: Wall): WallSceneNode {
  return {
    id: `${WALL_NODE_PREFIX}${wall.id}`,
    kind: 'wall',
    floorId: floor.id,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
  }
}

export function deriveUnderlayNode(floor: Floor, underlay: Underlay): UnderlaySceneNode {
  return {
    id: `${UNDERLAY_NODE_PREFIX}${underlay.id}`,
    kind: 'underlay',
    floorId: floor.id,
    image: underlay.image,
    width: underlay.width,
    height: underlay.height,
    placement: underlay.placement,
    opacity: underlay.opacity,
    visible: underlay.visible,
  }
}

export function deriveUnderlayNodesForFloor(floor: Floor): UnderlaySceneNode[] {
  return floor.underlays.map((underlay) => deriveUnderlayNode(floor, underlay))
}

export function deriveOpeningNode(
  floor: Floor,
  opening: Opening,
  hostWall: Wall,
): OpeningSceneNode {
  const geometry = deriveOpeningGeometry(opening, hostWall)
  return {
    id: `${OPENING_NODE_PREFIX}${opening.id}`,
    kind: 'opening',
    floorId: floor.id,
    type: opening.type,
    center: geometry.center,
    along: geometry.along,
    normal: geometry.normal,
    width: geometry.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    hostThickness: hostWall.thickness,
    orientation: opening.orientation,
  }
}

export function deriveOpeningNodesForFloor(floor: Floor): OpeningSceneNode[] {
  return floor.openings.flatMap((opening) => {
    const hostWall = floor.walls.find((wall) => wall.id === opening.hostWallId)
    return hostWall ? [deriveOpeningNode(floor, opening, hostWall)] : []
  })
}

export function deriveRoomNodesForFloor(
  floor: Floor,
  overrides?: Readonly<Record<string, RoomOverride>>,
): RoomSceneNode[] {
  return applyRoomOverrides(deriveRooms(floor.walls), overrides).map((room) => ({
    // room.id already carries the `room:` namespace prefix from the topology
    // layer (see core/topology/rooms.ts), so it is used directly here rather
    // than re-prefixed, unlike the locally namespaced floor and wall node ids.
    id: room.id,
    kind: 'room',
    floorId: floor.id,
    polygon: room.polygon,
    area: room.area,
    // Omit the optional name when absent so the no-overrides projection stays
    // identical to slice 1 under exactOptionalPropertyTypes.
    ...(room.name !== undefined && { name: room.name }),
  }))
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => deriveWallNode(floor, wall)),
    ),
    rooms: project.floors.flatMap((floor) => deriveRoomNodesForFloor(floor, project.roomOverrides)),
    underlays: project.floors.flatMap(deriveUnderlayNodesForFloor),
    openings: project.floors.flatMap(deriveOpeningNodesForFloor),
  }
}
