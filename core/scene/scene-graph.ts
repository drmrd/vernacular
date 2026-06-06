import type { Floor, Point, Project, Wall } from '../model/types'
import { deriveRooms } from '../topology/rooms'

// Kind-prefixed ids keep floor and wall node ids globally unique within the scene graph.
const FLOOR_NODE_PREFIX = 'floor:'
const WALL_NODE_PREFIX = 'wall:'

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
}

export interface SceneGraph {
  nodes: SceneNode[]
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
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

export function deriveRoomNodes(floor: Floor): RoomSceneNode[] {
  return deriveRooms(floor.walls).map((room) => ({
    id: room.id,
    kind: 'room',
    floorId: floor.id,
    polygon: room.polygon,
    area: room.area,
  }))
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => deriveWallNode(floor, wall)),
    ),
    rooms: project.floors.flatMap(deriveRoomNodes),
  }
}
