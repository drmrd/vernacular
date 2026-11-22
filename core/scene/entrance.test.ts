import { describe, expect, it } from 'vitest'
import { entranceOf, frontDirection, PLAN_DOWN, type Entrance } from '../index'
import {
  box,
  expectDirection,
  floorNode,
  openingOn,
  point,
  roomOnFloor,
  ROOM_SIZE,
  sceneOf,
  singleRoom,
  SLIDING_GLASS_DOOR,
  SLIDING_GLASS_WIDTH,
  SOUTH,
  SWING_DOOR,
  SWING_WIDTH,
} from './front-direction-test-support'

const GROUND_ELEVATION = 0
const WEST_WING = 'west-wing'
const EAST_WING = 'east-wing'
const WING_OFFSET = 2 * ROOM_SIZE

function hingedAndSlidingDoors() {
  const room = singleRoom()
  const swing = openingOn(room.south, { id: 'hinged', type: SWING_DOOR, width: SWING_WIDTH })
  const input = sceneOf(
    [room],
    [
      swing,
      openingOn(room.east, { id: 'sliding', type: SLIDING_GLASS_DOOR, width: SLIDING_GLASS_WIDTH }),
    ],
  )
  return { input, swing }
}

function twoWingsAtOneElevation() {
  const west = roomOnFloor(WEST_WING)
  const east = box({
    name: EAST_WING,
    floorId: EAST_WING,
    min: point(WING_OFFSET, 0),
    max: point(WING_OFFSET + ROOM_SIZE, ROOM_SIZE),
  })
  return {
    ...sceneOf(
      [west, east],
      [openingOn(west.south, { id: 'door' }), openingOn(east.south, { id: 'door' })],
    ),
    nodes: [floorNode(WEST_WING, GROUND_ELEVATION), floorNode(EAST_WING, GROUND_ELEVATION)],
    gradeElevation: GROUND_ELEVATION,
  }
}

describe('entranceOf', () => {
  it('names the guessed door with its floor and its front, and no door when there is no exterior door', () => {
    const { input, swing } = hingedAndSlidingDoors()
    const guessed: Entrance = entranceOf(input)

    expect(guessed.door?.id).toBe(swing.id)
    expect(guessed.door?.floorId).toBe(swing.floorId)
    expect(guessed.source).toBe('guessed')
    expectDirection(guessed.front, SOUTH)

    const bare = entranceOf(sceneOf([singleRoom()], []))

    expect(bare.door).toBeUndefined()
    expect(bare.source).toBe('none')
    expect(bare.front).toEqual(PLAN_DOWN)
  })

  it('breaks a tie between floors at one elevation by document order, not by floor id', () => {
    expect(entranceOf(twoWingsAtOneElevation()).door?.floorId).toBe(WEST_WING)
  })

  it('has frontDirection return the front of the entrance', () => {
    const inputs = [
      hingedAndSlidingDoors().input,
      sceneOf([singleRoom()], []),
      twoWingsAtOneElevation(),
    ]

    for (const input of inputs) {
      expect(frontDirection(input)).toEqual(entranceOf(input).front)
    }
  })
})
