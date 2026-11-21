import { describe, it } from 'vitest'
import type { FrontDirectionInput } from './front-direction'
import {
  box,
  EAST,
  expectDirection,
  floorNode,
  NORTH,
  openingOn,
  point,
  ROOM_SIZE,
  sceneOf,
  unitFrontDirection,
  WEST,
  type Box,
} from './front-direction-test-support'

const FRENCH_DOOR = 'french-door'
const SWING_DOOR = 'single-swing-door'
const FRENCH_DOOR_WIDTH = 1626
const SWING_DOOR_WIDTH = 813
const BASEMENT_ELEVATION = -2400
const GROUND_ELEVATION = 0
const UPPER_ELEVATION = 2700
const TOP_ELEVATION = 5400
const CELLAR_ELEVATION = -4800
const RAISED_GRADE = 1000

interface Floor {
  readonly id: string
  readonly elevation: number
}

type WallName = 'south' | 'east' | 'north' | 'west'

interface DoorPlacement {
  readonly id: string
  readonly floor: string
  readonly wall: WallName
  readonly type: string
  readonly width: number
}

const BASEMENT: Floor = { id: 'basement', elevation: BASEMENT_ELEVATION }
const GROUND: Floor = { id: 'ground', elevation: GROUND_ELEVATION }
const UPPER: Floor = { id: 'upper', elevation: UPPER_ELEVATION }
const TOP: Floor = { id: 'top', elevation: TOP_ELEVATION }
const CELLAR: Floor = { id: 'cellar', elevation: CELLAR_ELEVATION }

const A_BASEMENT = french('a-basement', 'basement', 'west')
const B_UPPER = french('b-upper', 'upper', 'east')
const C_GROUND: DoorPlacement = {
  id: 'c-ground',
  floor: 'ground',
  wall: 'north',
  type: SWING_DOOR,
  width: SWING_DOOR_WIDTH,
}

function french(id: string, floor: string, wall: WallName): DoorPlacement {
  return { id, floor, wall, type: FRENCH_DOOR, width: FRENCH_DOOR_WIDTH }
}

function boxOnFloor(boxes: ReadonlyMap<string, Box>, floorId: string): Box {
  const found = boxes.get(floorId)
  if (found === undefined) {
    throw new Error(`No room was built for the floor ${floorId}`)
  }
  return found
}

/** One closed room per floor, with the doors placed in the named walls of their floors. */
function sceneOfFloors(
  floors: readonly Floor[],
  doors: readonly DoorPlacement[],
): FrontDirectionInput {
  const boxes = new Map(
    floors.map((floor) => [
      floor.id,
      box({
        name: floor.id,
        floorId: floor.id,
        min: point(0, 0),
        max: point(ROOM_SIZE, ROOM_SIZE),
      }),
    ]),
  )
  const openings = doors.map((door) =>
    openingOn(boxOnFloor(boxes, door.floor)[door.wall], {
      id: door.id,
      type: door.type,
      width: door.width,
    }),
  )
  return sceneOf([...boxes.values()], openings)
}

/** The floor nodes of `floors`, and the grade when one is given. */
function levelsOf(floors: readonly Floor[], gradeElevation?: number) {
  const nodes = floors.map((floor) => floorNode(floor.id, floor.elevation))
  return gradeElevation === undefined ? { nodes } : { nodes, gradeElevation }
}

describe('frontDirection on a plan with floors above and below grade', () => {
  const floors = [BASEMENT, GROUND, UPPER]

  it('takes the entrance from the ground floor, then from the floors above grade, then from the floors below it', () => {
    const doors = [A_BASEMENT, B_UPPER, C_GROUND]
    const input = { ...sceneOfFloors(floors, doors), ...levelsOf(floors, 0) }

    expectDirection(unitFrontDirection(input), NORTH)
  })

  it('takes the door of the floor above grade when the ground floor has no door, though the basement door sorts first', () => {
    const input = {
      ...sceneOfFloors(floors, [A_BASEMENT, B_UPPER]),
      ...levelsOf(floors, 0),
    }

    expectDirection(unitFrontDirection(input), EAST)
  })

  it('counts every floor at grade when the graph has no floor nodes and no grade, so the opening id decides', () => {
    const input = sceneOfFloors(floors, [A_BASEMENT, B_UPPER, C_GROUND])

    expectDirection(unitFrontDirection(input), WEST)
  })

  it('takes the lowest level above grade first when the ground floor has no door', () => {
    const stack = [GROUND, UPPER, TOP]
    const doors = [french('b-upper', 'upper', 'east'), french('a-top', 'top', 'west')]
    const input = { ...sceneOfFloors(stack, doors), ...levelsOf(stack, 0) }

    expectDirection(unitFrontDirection(input), EAST)
  })

  it('takes the highest level below grade first when no floor above grade has a door', () => {
    const stack = [GROUND, BASEMENT, CELLAR]
    const doors = [french('b-basement', 'basement', 'east'), french('a-cellar', 'cellar', 'west')]
    const input = { ...sceneOfFloors(stack, doors), ...levelsOf(stack, 0) }

    expectDirection(unitFrontDirection(input), EAST)
  })

  it('moves the ground level with the grade elevation', () => {
    const doors = [A_BASEMENT, B_UPPER, C_GROUND]
    const input = { ...sceneOfFloors(floors, doors), ...levelsOf(floors, RAISED_GRADE) }

    expectDirection(unitFrontDirection(input), EAST)
  })
})
