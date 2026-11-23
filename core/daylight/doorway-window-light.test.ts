// core/daylight/doorway-window-light.test.ts
import { describe, expect, it } from 'vitest'
import {
  ADJOINING_WALL_EXCHANGE_AREA,
  STRAIGHT_ON_EXCHANGE_AREA,
  WINDOW_TRANSMITTANCE,
  farHall,
  hall,
  northWindowRoom,
  testRoom,
} from './doorway-test-support'
import type { DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import { relativeError } from './upright-form-factor-test-support'

const TOLERANCE = 1e-9
const DOORWAY_AREA = 1000 * 2100
// F = 0.5 * 0.8 * 1000 * 1200 mm squared, the flux of the one window of either source room.
const WINDOW_FLUX = 480000
// S' (1 - rho') of a source room with the hall's doorway: 24556000 mm squared.
const SOURCE_BALANCE_AREA = 24556000
const FLOOR_REFLECTANCE = 0.5

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

  it('routes no window light across a second doorway', () => {
    const solver = createDaylightFieldSolver([testRoom, hall, farHall])
    expect(solver.enteringFlux(2, UNIFORM_SKY)).toBe(0)
  })
})
