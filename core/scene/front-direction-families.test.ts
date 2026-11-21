import { describe, it } from 'vitest'
import {
  box,
  EAST,
  expectDirection,
  floorNode,
  NORTH,
  openingOn,
  point,
  ROOM_SIZE,
  singleRoom,
  sceneOf,
  SOUTH,
  unitFrontDirection,
  WEST,
} from './front-direction-test-support'

const SWING_DOOR = 'single-swing-door'
const PIVOT_DOOR = 'pivot-door'
const SLIDING_GLASS_DOOR = 'sliding-glass-door'
const BARN_DOOR = 'barn-door'
const BYPASS_DOOR = 'bypass-door'
const BIFOLD_DOOR = 'bifold-door'
const CASED_OPENING = 'cased-opening'
const SWING_WIDTH = 813
const PIVOT_WIDTH = 914
const BARN_WIDTH = 965
const BIFOLD_WIDTH = 813
const CASED_WIDTH = 914
const BYPASS_WIDTH = 1524
const SLIDING_GLASS_WIDTH = 1829
const UPPER_ELEVATION = 2700

describe('frontDirection with doors of different families on one level', () => {
  it('prefers a swing or pivot door to a wider sliding, folding, or cased door on the same level', () => {
    const room = singleRoom()
    const input = sceneOf(
      [room],
      [
        openingOn(room.south, { id: 'hinged', type: SWING_DOOR, width: SWING_WIDTH }),
        openingOn(room.east, {
          id: 'sliding',
          type: SLIDING_GLASS_DOOR,
          width: SLIDING_GLASS_WIDTH,
        }),
      ],
    )

    expectDirection(unitFrontDirection(input), SOUTH)
  })

  it('prefers a narrower pivot door to a wider barn door', () => {
    const room = singleRoom()
    const input = sceneOf(
      [room],
      [
        openingOn(room.west, { id: 'pivot', type: PIVOT_DOOR, width: PIVOT_WIDTH }),
        openingOn(room.north, { id: 'barn', type: BARN_DOOR, width: BARN_WIDTH }),
      ],
    )

    expectDirection(unitFrontDirection(input), WEST)
  })

  it('takes the widest of the unhinged doors when no door swings or pivots', () => {
    const room = singleRoom()
    const input = sceneOf(
      [room],
      [
        openingOn(room.south, { id: 'folding', type: BIFOLD_DOOR, width: BIFOLD_WIDTH }),
        openingOn(room.east, { id: 'cased', type: CASED_OPENING, width: CASED_WIDTH }),
      ],
    )

    expectDirection(unitFrontDirection(input), EAST)
  })

  it('ranks the floor before the door family, so a sliding ground floor door beats a hinged door upstairs', () => {
    const ground = box({
      name: 'ground',
      floorId: 'ground',
      min: point(0, 0),
      max: point(ROOM_SIZE, ROOM_SIZE),
    })
    const upper = box({
      name: 'upper',
      floorId: 'upper',
      min: point(0, 0),
      max: point(ROOM_SIZE, ROOM_SIZE),
    })
    const input = {
      ...sceneOf(
        [ground, upper],
        [
          openingOn(ground.south, { id: 'sliding', type: BYPASS_DOOR, width: BYPASS_WIDTH }),
          openingOn(upper.east, { id: 'hinged', type: SWING_DOOR, width: SWING_WIDTH }),
        ],
      ),
      nodes: [floorNode('ground', 0), floorNode('upper', UPPER_ELEVATION)],
      gradeElevation: 0,
    }

    expectDirection(unitFrontDirection(input), SOUTH)
  })

  it('ranks swing and pivot doors equal, so the wider one wins', () => {
    const room = singleRoom()
    const input = sceneOf(
      [room],
      [
        openingOn(room.south, { id: 'swing', type: SWING_DOOR, width: SWING_WIDTH }),
        openingOn(room.north, { id: 'pivot', type: PIVOT_DOOR, width: PIVOT_WIDTH }),
      ],
    )

    expectDirection(unitFrontDirection(input), NORTH)
  })
})
