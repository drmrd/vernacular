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

const PLAN_A_WALLS: WallSpec[] = [
  { id: 'south', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
  { id: 'east', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
  { id: 'long-north', start: { x: 0, y: 3000 }, end: { x: 10000, y: 3000 } },
  { id: 'west', start: { x: 0, y: 3000 }, end: { x: 0, y: 0 } },
]

const PLAN_A_OPENINGS: OpeningSpec[] = [
  { id: 'front-door', type: DOOR, hostWallId: 'long-north', position: 2000, width: 1000 },
  { id: 'back-door', type: DOOR, hostWallId: 'south', position: 2000, width: 800 },
  { id: 'far-window', type: WINDOW, hostWallId: 'long-north', position: 7000, width: 900 },
]

/** Plan A: a 4000 x 3000 room whose north wall runs on to 10000 past the room. */
export function longNorthWallFloor(): Floor {
  return floorOf(PLAN_A_WALLS, PLAN_A_OPENINGS)
}

const PLAN_C1_WALLS: WallSpec[] = [
  { id: 'south', start: { x: 0, y: 0 }, end: { x: 8000, y: 0 } },
  { id: 'east', start: { x: 8000, y: 0 }, end: { x: 8000, y: 4000 } },
  { id: 'north', start: { x: 8000, y: 4000 }, end: { x: 0, y: 4000 } },
  { id: 'west', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 } },
  { id: 'partition', start: { x: 4000, y: 0 }, end: { x: 4000, y: 4000 } },
]

const PLAN_C1_OPENINGS: OpeningSpec[] = [
  { id: 'north-door', type: DOOR, hostWallId: 'north', position: 6000, width: 900 },
]

/** Plan C1: an 8000 x 4000 block cut into two rooms by a partition at its middle. */
export function centeredPartitionFloor(): Floor {
  return floorOf(PLAN_C1_WALLS, PLAN_C1_OPENINGS)
}

const PLAN_A2_BLOCK_WALLS: WallSpec[] = [
  { id: 'long-south', start: { x: 0, y: 0 }, end: { x: 10000, y: 0 } },
  { id: 'east', start: { x: 10000, y: 0 }, end: { x: 10000, y: 4000 } },
  { id: 'north', start: { x: 10000, y: 4000 }, end: { x: 0, y: 4000 } },
  { id: 'west', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 } },
]

const PLAN_A2_ELL_WALLS: WallSpec[] = [
  { id: 'ell-west', start: { x: 3000, y: 0 }, end: { x: 3000, y: -3000 } },
  { id: 'ell-south', start: { x: 3000, y: -3000 }, end: { x: 7000, y: -3000 } },
  { id: 'ell-east', start: { x: 7000, y: -3000 }, end: { x: 7000, y: 0 } },
]

const PLAN_A2_OPENINGS: OpeningSpec[] = [
  { id: 'side-window', type: WINDOW, hostWallId: 'long-south', position: 1500, width: 900 },
]

/** Plan A2: a 10000 x 4000 block with an ell on its south wall, centered between the ends. */
export function centeredEllFloor(): Floor {
  return floorOf([...PLAN_A2_BLOCK_WALLS, ...PLAN_A2_ELL_WALLS], PLAN_A2_OPENINGS)
}

const PLAN_A3_ELL_WALLS: WallSpec[] = [
  { id: 'ell-west', start: { x: 0, y: 0 }, end: { x: 0, y: -3000 } },
  { id: 'ell-south', start: { x: 0, y: -3000 }, end: { x: 4000, y: -3000 } },
  { id: 'ell-east', start: { x: 4000, y: -3000 }, end: { x: 4000, y: 0 } },
]

const PLAN_A3_OPENINGS: OpeningSpec[] = [
  { id: 'inner-door', type: DOOR, hostWallId: 'long-south', position: 2000, width: 900 },
]

/** Plan A3: the block of plan A2 with an ell flush against its west wall. */
export function flushEllFloor(): Floor {
  return floorOf([...PLAN_A2_BLOCK_WALLS, ...PLAN_A3_ELL_WALLS], PLAN_A3_OPENINGS)
}

const PLAN_B_OUTER_WALLS: WallSpec[] = [
  { id: 'o-s', start: { x: 0, y: 0 }, end: { x: 10000, y: 0 } },
  { id: 'o-e', start: { x: 10000, y: 0 }, end: { x: 10000, y: 10000 } },
  { id: 'o-n', start: { x: 10000, y: 10000 }, end: { x: 0, y: 10000 } },
  { id: 'o-w', start: { x: 0, y: 10000 }, end: { x: 0, y: 0 } },
]

const PLAN_B_COURTYARD_WALLS: WallSpec[] = [
  { id: 'c-s', start: { x: 3000, y: 3000 }, end: { x: 7000, y: 3000 } },
  { id: 'c-e', start: { x: 7000, y: 3000 }, end: { x: 7000, y: 7000 } },
  { id: 'c-n', start: { x: 7000, y: 7000 }, end: { x: 3000, y: 7000 } },
  { id: 'c-w', start: { x: 3000, y: 7000 }, end: { x: 3000, y: 3000 } },
]

const PLAN_B_OPENINGS: OpeningSpec[] = [
  { id: 'courtyard-door', type: DOOR, hostWallId: 'c-s', position: 2000, width: 1200 },
  { id: 'street-door', type: DOOR, hostWallId: 'o-s', position: 5000, width: 900 },
]

/** Plan B: a 10000 square ring of rooms around a 4000 square courtyard. */
export function courtyardFloor(): Floor {
  return floorOf([...PLAN_B_OUTER_WALLS, ...PLAN_B_COURTYARD_WALLS], PLAN_B_OPENINGS)
}

const PLAN_B2_LINK: WallSpec = {
  id: 'link',
  start: { x: 5000, y: 0 },
  end: { x: 5000, y: 3000 },
}

/** Plan B2: plan B with a wall that joins the outer south wall to the courtyard. */
export function linkedShaftFloor(): Floor {
  const walls = [...PLAN_B_OUTER_WALLS, ...PLAN_B_COURTYARD_WALLS, PLAN_B2_LINK]
  return floorOf(walls, [])
}
