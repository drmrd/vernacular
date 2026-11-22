import { describe, expect, it } from 'vitest'
import { entranceOf } from './front-direction'
import {
  box,
  expectDirection,
  GROUND_FLOOR,
  NORTH,
  openingOn,
  point,
  roomOnFloor,
  ROOM_SIZE,
  SOUTH,
  UPPER_FLOOR,
  WEST,
} from './front-direction-test-support'
import type { OpeningSceneNode } from './scene-graph'

const UNIT = 1000
const TALL_ROOM_TOP = 3 * ROOM_SIZE
const FAR_WEST_LEFT = -5 * ROOM_SIZE
const FAR_WEST_RIGHT = -4 * ROOM_SIZE
const WIDE_ROOM_RIGHT_EDGE = 2.5 * ROOM_SIZE

/** The same opening carrying the main entrance mark. */
function marked(opening: OpeningSceneNode): OpeningSceneNode {
  return { ...opening, entrance: true }
}

describe('entranceOf with a marked door on an exterior run', () => {
  // A tall room east of the square one puts the center of the walls at (4000, 6000), so
  // the square room's north wall lies south-west of the center although it faces north.
  const square = roomOnFloor(GROUND_FLOOR, 'square')
  const tall = box({
    name: 'tall',
    floorId: GROUND_FLOOR,
    min: point(ROOM_SIZE, 0),
    max: point(2 * ROOM_SIZE, TALL_ROOM_TOP),
  })

  it.each(['inward', 'outward'] as const)(
    'faces the outward normal of the run, not the side away from the wall center (door normal %s)',
    (normal) => {
      const chosen = marked(openingOn(square.north, { id: 'chosen', normal }))
      const input = {
        walls: [
          square.south,
          square.east,
          square.north,
          square.west,
          tall.south,
          tall.north,
          tall.east,
        ],
        rooms: [square.room, tall.room],
        openings: [chosen],
      }

      const { front, source } = entranceOf(input)

      expect(source).toBe('marked')
      expectDirection(front, NORTH)
    },
  )
})

describe('entranceOf with a marked interior door between rooms stacked along y', () => {
  // The rooms share the partition at `partitionY`; every wall lies in x 0..ROOM_SIZE, so
  // the door center and the wall center agree in x and only y decides.
  function stackedRooms(bottom: number, partitionY: number, top: number) {
    const lower = box({
      name: 'lower',
      floorId: GROUND_FLOOR,
      min: point(0, bottom * UNIT),
      max: point(ROOM_SIZE, partitionY * UNIT),
    })
    const upper = box({
      name: 'upper',
      floorId: GROUND_FLOOR,
      min: point(0, partitionY * UNIT),
      max: point(ROOM_SIZE, top * UNIT),
    })
    return { lower, upper }
  }

  it.each([
    { where: 'below', bottom: -1, partitionY: 1, top: 5, expected: SOUTH },
    { where: 'above', bottom: -5, partitionY: -1, top: 1, expected: NORTH },
  ])(
    'faces away from the wall center when the door center lies $where the center in y',
    ({ bottom, partitionY, top, expected }) => {
      const { lower, upper } = stackedRooms(bottom, partitionY, top)
      const chosen = marked(openingOn(lower.north, { id: 'chosen' }))
      const input = {
        walls: [
          lower.south,
          lower.east,
          lower.north,
          lower.west,
          upper.east,
          upper.north,
          upper.west,
        ],
        rooms: [lower.room, upper.room],
        openings: [chosen],
      }

      const { front, source } = entranceOf(input)

      expect(source).toBe('marked')
      expectDirection(front, expected)
    },
  )
})

describe('entranceOf with a marked interior door and walls on another floor', () => {
  it('finds the wall center from the walls on the door floor alone', () => {
    const left = roomOnFloor(GROUND_FLOOR, 'left')
    const right = box({
      name: 'right',
      floorId: GROUND_FLOOR,
      min: point(ROOM_SIZE, 0),
      max: point(WIDE_ROOM_RIGHT_EDGE, ROOM_SIZE),
    })
    // Counted with the ground walls, this room would move the center far to the west
    // of the partition and flip the answer from west to east.
    const remote = box({
      name: 'remote',
      floorId: UPPER_FLOOR,
      min: point(FAR_WEST_LEFT, 0),
      max: point(FAR_WEST_RIGHT, ROOM_SIZE),
    })
    const partitionDoor = marked(openingOn(left.east, { id: 'chosen' }))
    const input = {
      walls: [
        left.south,
        left.north,
        left.west,
        left.east,
        right.south,
        right.north,
        right.east,
        remote.south,
        remote.east,
        remote.north,
        remote.west,
      ],
      rooms: [left.room, right.room, remote.room],
      openings: [partitionDoor],
    }

    const { front } = entranceOf(input)

    expectDirection(front, WEST)
  })
})
