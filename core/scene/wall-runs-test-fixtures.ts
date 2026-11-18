import { createFloor, createOpening, createWall } from '../model/factories'
import type { Floor, Point } from '../model/types'
import {
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  deriveWallNode,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'

const FLOOR_ID = 'g'
const WALL_THICKNESS = 114
const DOOR = 'single-swing-door'
const WINDOW = 'double-hung-window'

interface WallSpec {
  id: string
  start: Point
  end: Point
}

interface OpeningSpec {
  id: string
  type: string
  hostWallId: string
  position: number
  width: number
}

function floorOf(wallSpecs: readonly WallSpec[], openingSpecs: readonly OpeningSpec[]): Floor {
  const walls = wallSpecs.map((spec) =>
    createWall(spec.start, spec.end, { id: spec.id, thickness: WALL_THICKNESS }),
  )
  const openings = openingSpecs.map((spec) => createOpening(spec))
  return { ...createFloor('Ground', { id: FLOOR_ID, walls }), openings }
}

/** The walls and openings of a floor, derived the way the scene graph derives them. */
export function nodesOf(floor: Floor): {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
} {
  const rooms = deriveRoomNodesForFloor(floor)
  return {
    walls: floor.walls.map((wall) => deriveWallNode(floor, wall)),
    rooms,
    openings: deriveOpeningNodesForFloor(floor, rooms),
  }
}

const LONG_NORTH_WALL_WALLS: WallSpec[] = [
  { id: 'south', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
  { id: 'east', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
  { id: 'long-north', start: { x: 0, y: 3000 }, end: { x: 10000, y: 3000 } },
  { id: 'west', start: { x: 0, y: 3000 }, end: { x: 0, y: 0 } },
]

const LONG_NORTH_WALL_OPENINGS: OpeningSpec[] = [
  { id: 'front-door', type: DOOR, hostWallId: 'long-north', position: 2000, width: 1000 },
  { id: 'back-door', type: DOOR, hostWallId: 'south', position: 2000, width: 800 },
  { id: 'far-window', type: WINDOW, hostWallId: 'long-north', position: 7000, width: 900 },
]

/** A 4000 x 3000 room whose north wall runs on to 10000 past the room. */
export function longNorthWallFloor(): Floor {
  return floorOf(LONG_NORTH_WALL_WALLS, LONG_NORTH_WALL_OPENINGS)
}

const CENTERED_PARTITION_X = 4000
const OFF_CENTER_PARTITION_X = 3000

const PARTITION_BLOCK_WALLS: WallSpec[] = [
  { id: 'south', start: { x: 0, y: 0 }, end: { x: 8000, y: 0 } },
  { id: 'east', start: { x: 8000, y: 0 }, end: { x: 8000, y: 4000 } },
  { id: 'north', start: { x: 8000, y: 4000 }, end: { x: 0, y: 4000 } },
  { id: 'west', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 } },
]

function partitionWalls(partitionX: number): WallSpec[] {
  const partition = {
    id: 'partition',
    start: { x: partitionX, y: 0 },
    end: { x: partitionX, y: 4000 },
  }
  return [...PARTITION_BLOCK_WALLS, partition]
}

const CENTERED_PARTITION_OPENINGS: OpeningSpec[] = [
  { id: 'north-door', type: DOOR, hostWallId: 'north', position: 6000, width: 900 },
]

/** An 8000 x 4000 block cut into two rooms by a partition at its middle. */
export function centeredPartitionFloor(): Floor {
  return floorOf(partitionWalls(CENTERED_PARTITION_X), CENTERED_PARTITION_OPENINGS)
}

/** The same block with its partition at x = 3000, nearer the west wall than the middle. */
export function offCenterPartitionFloor(): Floor {
  return floorOf(partitionWalls(OFF_CENTER_PARTITION_X), CENTERED_PARTITION_OPENINGS)
}

const BLOCK_WALLS: WallSpec[] = [
  { id: 'long-south', start: { x: 0, y: 0 }, end: { x: 10000, y: 0 } },
  { id: 'east', start: { x: 10000, y: 0 }, end: { x: 10000, y: 4000 } },
  { id: 'north', start: { x: 10000, y: 4000 }, end: { x: 0, y: 4000 } },
  { id: 'west', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 } },
]

const CENTERED_ELL_WALLS: WallSpec[] = [
  { id: 'ell-west', start: { x: 3000, y: 0 }, end: { x: 3000, y: -3000 } },
  { id: 'ell-south', start: { x: 3000, y: -3000 }, end: { x: 7000, y: -3000 } },
  { id: 'ell-east', start: { x: 7000, y: -3000 }, end: { x: 7000, y: 0 } },
]

const CENTERED_ELL_OPENINGS: OpeningSpec[] = [
  { id: 'side-window', type: WINDOW, hostWallId: 'long-south', position: 1500, width: 900 },
]

/** A 10000 x 4000 block with an ell on its south wall, centered between the ends. */
export function centeredEllFloor(): Floor {
  return floorOf([...BLOCK_WALLS, ...CENTERED_ELL_WALLS], CENTERED_ELL_OPENINGS)
}

const FLUSH_ELL_WALLS: WallSpec[] = [
  { id: 'ell-west', start: { x: 0, y: 0 }, end: { x: 0, y: -3000 } },
  { id: 'ell-south', start: { x: 0, y: -3000 }, end: { x: 4000, y: -3000 } },
  { id: 'ell-east', start: { x: 4000, y: -3000 }, end: { x: 4000, y: 0 } },
]

const FLUSH_ELL_OPENINGS: OpeningSpec[] = [
  { id: 'inner-door', type: DOOR, hostWallId: 'long-south', position: 2000, width: 900 },
]

/** The 10000 x 4000 block with an ell flush against its west wall. */
export function flushEllFloor(): Floor {
  return floorOf([...BLOCK_WALLS, ...FLUSH_ELL_WALLS], FLUSH_ELL_OPENINGS)
}

const COURTYARD_OUTER_WALLS: WallSpec[] = [
  { id: 'o-s', start: { x: 0, y: 0 }, end: { x: 10000, y: 0 } },
  { id: 'o-e', start: { x: 10000, y: 0 }, end: { x: 10000, y: 10000 } },
  { id: 'o-n', start: { x: 10000, y: 10000 }, end: { x: 0, y: 10000 } },
  { id: 'o-w', start: { x: 0, y: 10000 }, end: { x: 0, y: 0 } },
]

const COURTYARD_INNER_WALLS: WallSpec[] = [
  { id: 'c-s', start: { x: 3000, y: 3000 }, end: { x: 7000, y: 3000 } },
  { id: 'c-e', start: { x: 7000, y: 3000 }, end: { x: 7000, y: 7000 } },
  { id: 'c-n', start: { x: 7000, y: 7000 }, end: { x: 3000, y: 7000 } },
  { id: 'c-w', start: { x: 3000, y: 7000 }, end: { x: 3000, y: 3000 } },
]

const COURTYARD_OPENINGS: OpeningSpec[] = [
  { id: 'courtyard-door', type: DOOR, hostWallId: 'c-s', position: 2000, width: 1200 },
  { id: 'street-door', type: DOOR, hostWallId: 'o-s', position: 5000, width: 900 },
]

/** A 10000 square ring of rooms around a 4000 square courtyard. */
export function courtyardFloor(): Floor {
  return floorOf([...COURTYARD_OUTER_WALLS, ...COURTYARD_INNER_WALLS], COURTYARD_OPENINGS)
}

const SHAFT_LINK_WALL: WallSpec = {
  id: 'link',
  start: { x: 5000, y: 0 },
  end: { x: 5000, y: 3000 },
}

/** The courtyard ring with a wall that joins the outer south wall to the courtyard. */
export function linkedShaftFloor(): Floor {
  const walls = [...COURTYARD_OUTER_WALLS, ...COURTYARD_INNER_WALLS, SHAFT_LINK_WALL]
  return floorOf(walls, [])
}
