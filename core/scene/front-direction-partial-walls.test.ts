import { describe, expect, it } from 'vitest'
import { frontDirection, type PlanDirection } from './front-direction'
import { centeredPartitionFloor, longNorthWallFloor, nodesOf } from './wall-runs-test-fixtures'

const DIRECTION_DECIMAL_PLACES = 9

function expectDirection(actual: PlanDirection, expected: PlanDirection): void {
  expect(actual.x).toBeCloseTo(expected.x, DIRECTION_DECIMAL_PLACES)
  expect(actual.y).toBeCloseTo(expected.y, DIRECTION_DECIMAL_PLACES)
}

describe('frontDirection on walls that bound a room along only part of their length', () => {
  it('faces the door beside the room, which is wider than the door on the south wall', () => {
    expectDirection(frontDirection(nodesOf(longNorthWallFloor())), { x: 0, y: 1 })
  })

  it('faces plan-down when the door beside the room is taken away', () => {
    const { walls, rooms, openings } = nodesOf(longNorthWallFloor())
    const withoutFrontDoor = openings.filter((opening) => !opening.id.endsWith('front-door'))

    expectDirection(frontDirection({ walls, rooms, openings: withoutFrontDoor }), { x: 0, y: -1 })
  })

  it('faces the only door on the outside of a block cut in two by a partition', () => {
    expectDirection(frontDirection(nodesOf(centeredPartitionFloor())), { x: 0, y: 1 })
  })
})
