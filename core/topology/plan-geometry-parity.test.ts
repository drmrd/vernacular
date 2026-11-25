import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { legacyDeriveRooms } from './legacy-room-walk-test-support'
import { planArbitrary, PROPERTY_RUNS } from './plan-arbitraries-test-support'
import { fixtureFloors } from './plan-geometry-fixture-floors-test-support'
import { floorOf } from './plan-geometry-test-support'
import { deriveRooms } from './rooms'
import type { Room } from './rooms'
import type { Wall } from '../model/types'

/** The fields of `Room` only, so that members the plan geometry adds later do not matter here. */
function roomFields(room: Room) {
  return {
    id: room.id,
    polygon: room.polygon,
    clearPolygon: room.clearPolygon,
    outerPolygon: room.outerPolygon,
    area: room.area,
    wallIds: room.wallIds,
    holes: room.holes,
  }
}

const floors = fixtureFloors()

function legacyRoomsOrNothing(walls: readonly Wall[]): Room[] | undefined {
  try {
    return legacyDeriveRooms(walls)
  } catch {
    return undefined
  }
}

describe('the rooms of the plan geometry', () => {
  describe.each(floors)('on $name', ({ walls }) => {
    it("gives the rooms of today's walk on every fixture floor", () => {
      const { rooms } = deriveFloorPlanGeometry(floorOf(walls))

      expect(rooms.map(roomFields)).toEqual(legacyDeriveRooms(walls).map(roomFields))
    })

    it("gives the rooms of today's walk through deriveRooms on every fixture floor", () => {
      expect(deriveRooms(walls).map(roomFields)).toEqual(legacyDeriveRooms(walls).map(roomFields))
    })
  })

  it('finds at least one room, one hole, and one profile wall among the fixture floors', () => {
    const rooms = floors.flatMap((floor) => legacyDeriveRooms(floor.walls))

    expect(rooms.length).toBeGreaterThan(0)
    expect(rooms.some((room) => room.holes !== undefined)).toBe(true)
    expect(
      floors.some((floor) => floor.walls.some((wall) => wall.constructionProfile !== undefined)),
    ).toBe(true)
  })

  it("gives the rooms of today's walk on generated plans", () => {
    fc.assert(
      fc.property(planArbitrary(), (plan) => {
        // The legacy walk cannot close a face when both ends of a wall merge into one junction.
        const legacy = legacyRoomsOrNothing(plan.walls)
        fc.pre(legacy !== undefined)

        const { rooms } = deriveFloorPlanGeometry(floorOf(plan.walls))

        expect(rooms.map(roomFields), plan.label).toEqual(legacy?.map(roomFields))
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
