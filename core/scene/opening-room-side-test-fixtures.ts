import { createFloor, createOpening, createWall } from '../model/factories'
import type { Floor, Point, Wall } from '../model/types'
import { openingRoomSide } from './opening-room-side'
import {
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  type OpeningSceneNode,
} from './scene-graph'

const FLOOR_ID = 'g'
export const WALL_THICKNESS = 114
const WINDOW_TYPE = 'double-hung-window'
const WINDOW_ID = 'window'
const WINDOW_WIDTH = 900
export const WINDOW_POSITION = 2000
export const ROOM_WIDTH = 4000
export const ROOM_DEPTH = 3000
export const THICK_RAW_WALL_MM = 200
export const THIN_PROFILE = 'platform-framed-drywall'

export function pt(x: number, y: number): Point {
  return { x, y }
}

export function wall(id: string, start: Point, end: Point): Wall {
  return createWall(start, end, { id, thickness: WALL_THICKNESS })
}

/** The four walls of the 4000 by 3000 room, counter-clockwise from the origin. */
export function counterClockwiseWalls(): Wall[] {
  return [
    wall('south', pt(0, 0), pt(ROOM_WIDTH, 0)),
    wall('east', pt(ROOM_WIDTH, 0), pt(ROOM_WIDTH, ROOM_DEPTH)),
    wall('north', pt(ROOM_WIDTH, ROOM_DEPTH), pt(0, ROOM_DEPTH)),
    wall('west', pt(0, ROOM_DEPTH), pt(0, 0)),
  ]
}

export interface WindowSpec {
  hostWallId: string
  position: number
  width: number
}

export function floorWithWindowSpec(walls: Wall[], spec: WindowSpec): Floor {
  const window = createOpening({ type: WINDOW_TYPE, id: WINDOW_ID, ...spec })
  return { ...createFloor('Ground', { id: FLOOR_ID, walls }), openings: [window] }
}

export function floorWithWindow(walls: Wall[], hostWallId: string, position: number): Floor {
  return floorWithWindowSpec(walls, { hostWallId, position, width: WINDOW_WIDTH })
}

export function windowNode(floor: Floor): OpeningSceneNode {
  const node = deriveOpeningNodesForFloor(floor).find((candidate) =>
    candidate.id.endsWith(WINDOW_ID),
  )
  if (node === undefined) {
    throw new Error('expected the fixture floor to derive the window node')
  }
  return node
}

function rawThicknessOfHost(floor: Floor): number {
  const node = windowNode(floor)
  const host = floor.walls.find((candidate) => candidate.id === node.hostWallId)
  if (host === undefined) {
    throw new Error('expected the window to sit on a wall of the fixture floor')
  }
  return host.thickness
}

export function roomSideOfWindow(floor: Floor) {
  return openingRoomSide(
    windowNode(floor),
    deriveRoomNodesForFloor(floor),
    rawThicknessOfHost(floor),
  )
}

/** A copy of the walls in which the named wall takes the given overrides. */
export function withWall(walls: Wall[], id: string, overrides: Partial<Wall>): Wall[] {
  return walls.map((raw) => (raw.id === id ? { ...raw, ...overrides } : raw))
}
