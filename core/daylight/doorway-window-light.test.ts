// core/daylight/doorway-window-light.test.ts
import { describe, expect, it } from 'vitest'
import {
  ADJOINING_WALL_EXCHANGE_AREA,
  DOORWAY_AREA,
  SOURCE_BALANCE_AREA,
  STRAIGHT_ON_EXCHANGE_AREA,
  WINDOW_FLUX,
  WINDOW_TRANSMITTANCE,
  farHall,
  hall,
  northWindowRoom,
  testRoom,
  verticalSpan,
} from './doorway-test-support'
import type { DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import { relativeError } from './upright-form-factor-test-support'

const TOLERANCE = 1e-9
const TEST_ROOM_WIDTH = 4000
const FLOOR_REFLECTANCE = 0.5
const SECOND_DOORWAY_START = 2200
const SECOND_DOORWAY_END = 2800
const SECOND_DOORWAY_HEAD = 2100
const HALL_FLUX = 44911.6289869
const SOURCE_BALANCE = 0.009254836446

/** The test room with a doorway of its own, opposite the hall's doorway, that opens to the hall. */
const testRoomWithDoorwayToHall: DaylightRoom = {
  ...testRoom,
  apertures: [
    ...testRoom.apertures,
    {
      span: verticalSpan(TEST_ROOM_WIDTH, SECOND_DOORWAY_START, SECOND_DOORWAY_END),
      sill: 0,
      head: SECOND_DOORWAY_HEAD,
      revealDepth: 0,
      opensTo: { room: 1 },
    },
  ],
}

/** The light the source room hands to the hall, and the light it loses, as the solver reports them. */
function routedLight(rooms: readonly DaylightRoom[]) {
  const solver = createDaylightFieldSolver(rooms)
  const sourceBalance = solver.interreflection(0, UNIFORM_SKY)
  const sourceFlux = solver.enteringFlux(0, UNIFORM_SKY)
  const hallFlux = solver.enteringFlux(1, UNIFORM_SKY)
  return {
    sourceFlux,
    hallFlux,
    sourceBalance,
    gained: hallFlux - DOORWAY_AREA * sourceBalance,
    lost: sourceFlux - (sourceBalance * SOURCE_BALANCE_AREA) / FLOOR_REFLECTANCE,
  }
}

const PAIRS = [
  { pair: 'a window on the facing wall', rooms: [testRoom, hall] },
  { pair: 'a window on the adjoining wall', rooms: [northWindowRoom, hall] },
]

describe('the window light that lands on a doorway leaves its room and enters the next room', () => {
  it("routes 0.0530759843 of the window's flux through a doorway that the window faces straight on", () => {
    const { gained, sourceFlux } = routedLight([testRoom, hall])
    const expected = WINDOW_TRANSMITTANCE * STRAIGHT_ON_EXCHANGE_AREA
    expect(expected).toBeCloseTo(25476.4724497, 6)
    expect(relativeError(gained, expected)).toBeLessThan(TOLERANCE)
    expect(relativeError(gained / sourceFlux, 0.0530759843)).toBeLessThan(TOLERANCE)
    expect(relativeError(sourceFlux, WINDOW_FLUX)).toBeLessThan(TOLERANCE)
  })

  it('routes 0.0785188000 of it through a doorway on the adjoining wall', () => {
    const { gained, sourceBalance, hallFlux } = routedLight([northWindowRoom, hall])
    const expected = WINDOW_TRANSMITTANCE * ADJOINING_WALL_EXCHANGE_AREA
    expect(expected).toBeCloseTo(37689.0239822, 6)
    expect(relativeError(gained, expected)).toBeLessThan(TOLERANCE)
    expect(relativeError(gained / WINDOW_FLUX, 0.078518799963)).toBeLessThan(TOLERANCE)
    expect(relativeError(sourceBalance, 0.009006169083)).toBeLessThan(TOLERANCE)
    expect(relativeError(hallFlux, 56601.9790571)).toBeLessThan(TOLERANCE)
  })

  it.each(PAIRS)(
    "takes from the source room's balance exactly what the next room gains, with $pair",
    ({ rooms }) => {
      const { gained, lost } = routedLight(rooms)
      expect(Math.abs(lost / gained - 1)).toBeLessThan(TOLERANCE)
    },
  )

  // A guard: this passed before window light was routed, and it pins the one-crossing rule.
  it('routes no window light across a second doorway', () => {
    const solver = createDaylightFieldSolver([testRoom, hall, farHall])
    expect(solver.enteringFlux(2, UNIFORM_SKY)).toBe(0)
  })

  it('sends no window light through a doorway of the room that opens to a room, not to the sky', () => {
    const rooms = [testRoomWithDoorwayToHall, hall]
    const { hallFlux, sourceBalance } = routedLight(rooms)
    expect(relativeError(hallFlux, HALL_FLUX)).toBeLessThan(TOLERANCE)
    expect(relativeError(sourceBalance, SOURCE_BALANCE)).toBeLessThan(TOLERANCE)
  })
})
