// core/daylight/doorway-luminance.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { sampleSkyVisibility } from './daylight-field'
import {
  DOORWAY_AREA,
  SOURCE_BALANCE_AREA,
  STRAIGHT_ON_EXCHANGE_AREA,
  WINDOW_FLUX,
  WINDOW_TRANSMITTANCE,
  hall,
  testRoom,
} from './doorway-test-support'
import { horizontalPointToWallRectangle } from './form-factor'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

// The light that a doorway passes, derived once.
//
// The window light Phi that lands on the doorway plane before any reflection leaves the source
// room. The rest of the flux, F - Phi, is what the room's surfaces reflect. The source room's
// interreflected illuminance E is the same at every surface. With S' and rho' counting each
// doorway out of the room as area of reflectance 0, the room balances as
// E S' (1 - rho') = (F - Phi) rhoFloor, where F is the flux that its sky apertures let in.
//
// The mean exitance of the source's surfaces is M = (rhoFloor (F - Phi) + rho' S' E) / S'.
// Substituting (F - Phi) rhoFloor = E S' (1 - rho') gives M = E.
//
// A doorway is a plane that faces a whole hemisphere of the source room, so its form factors to
// the source's surfaces sum to 1 (closure). The illuminance on the doorway plane from the walls is
// then 1 M = E. The window adds D = Phi / A to it, so the plane is lit by E + D and the flux that
// crosses it is A tau (E + D) = tau (A E + Phi). A window faces only the half of its hemisphere
// above the horizon, so its factor is one half.

const TOLERANCE = 1e-6
const RATIO_TOLERANCE = 1e-9
const DERIVATION_TOLERANCE = 1e-12
const DOORWAY_FACTOR = 1
const WINDOW_SKY_SHARE = 0.5
const DOORWAY_START = 1000
const DOORWAY_END = 2000
const DOORWAY_HEAD = 2100
const DOORWAY_TRANSMITTANCE = 1
const WORK_PLANE_HEIGHT = 850
const SOURCE_FLOOR_REFLECTANCE = 0.5
// S' of the test room with the hall's doorway: 60.4e6 + 2.1e6.
const SOURCE_AREA = 62500000
// rho' S': floor 12e6 at 0.5, the rest 48.4e6 at 0.66, the doorway at 0.
const SOURCE_REFLECTED_AREA = 37944000
// The window light that lands on the doorway: 0.8 of the exchange area of the test pair.
const ROUTED_FLUX = WINDOW_TRANSMITTANCE * STRAIGHT_ON_EXCHANGE_AREA
// (F - Phi) rhoFloor / (S' (1 - rho')): the balance over 62.5e6 - 37.944e6.
const E_SOURCE = ((WINDOW_FLUX - ROUTED_FLUX) * SOURCE_FLOOR_REFLECTANCE) / SOURCE_BALANCE_AREA
// The hall's S (1 - rho): S = 38e6, floor 3e6 at 0.5, the rest 32e6 at 0.66.
const HALL_ABSORBING_AREA = 13880000
const HALL_FLOOR_REFLECTANCE = 0.5
// The hall cell that the form factor test samples: 950 mm from the doorway wall (x = 0) and level
// with the doorway's middle, so the doorway lies 550 mm to one side and 450 mm to the other.
const HALL_CELL: Point = { x: -950, y: 1550 }

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

describe('a doorway passes the interreflected light of the room it opens into, with a factor of 1', () => {
  const rooms = [testRoom, hall]

  it('derives the factor: the mean exitance of the source surfaces equals their interreflected light', () => {
    const meanExitance =
      (SOURCE_FLOOR_REFLECTANCE * (WINDOW_FLUX - ROUTED_FLUX) + SOURCE_REFLECTED_AREA * E_SOURCE) /
      SOURCE_AREA
    expect(relativeError(meanExitance, E_SOURCE)).toBeLessThan(DERIVATION_TOLERANCE)
  })

  it('lets into the hall the transmittance times (1 times the doorway area times the source interreflection plus the routed window light)', () => {
    const solver = createDaylightFieldSolver(rooms)
    const flux = solver.enteringFlux(1, UNIFORM_SKY)
    const expected =
      DOORWAY_TRANSMITTANCE * (DOORWAY_FACTOR * DOORWAY_AREA * E_SOURCE + ROUTED_FLUX)
    expect(expected).toBeCloseTo(44911.6289869, 4)
    expect(relativeError(flux, expected)).toBeLessThan(TOLERANCE)
    const sourceInterreflection = solver.interreflection(0, UNIFORM_SKY)
    const factor =
      (flux - ROUTED_FLUX) / (DOORWAY_AREA * DOORWAY_TRANSMITTANCE * sourceInterreflection)
    expect(Math.abs(factor - DOORWAY_FACTOR)).toBeLessThan(RATIO_TOLERANCE)
  })

  it('lights a hall cell by the doorway form factor times that light plus the hall interreflection', () => {
    const solver = createDaylightFieldSolver(rooms)
    const doorwayFromCell = horizontalPointToWallRectangle(
      {
        x0: DOORWAY_START - HALL_CELL.y,
        x1: DOORWAY_END - HALL_CELL.y,
        z0: 0,
        z1: DOORWAY_HEAD - WORK_PLANE_HEIGHT,
      },
      -HALL_CELL.x,
    )
    const hallFlux =
      DOORWAY_TRANSMITTANCE * (DOORWAY_FACTOR * DOORWAY_AREA * E_SOURCE + ROUTED_FLUX)
    const hallInterreflection = (hallFlux * HALL_FLOOR_REFLECTANCE) / HALL_ABSORBING_AREA
    expect(hallInterreflection).toBeCloseTo(0.00161785407, 9)
    expect(relativeError(solver.interreflection(1, UNIFORM_SKY), hallInterreflection)).toBeLessThan(
      TOLERANCE,
    )
    const doorwayLuminance = E_SOURCE + ROUTED_FLUX / DOORWAY_AREA
    const expected =
      doorwayFromCell * DOORWAY_TRANSMITTANCE * doorwayLuminance + hallInterreflection
    expect(expected).toBeCloseTo(0.003641003847, 6)
    const actual = sampleSkyVisibility(solver.field(UNIFORM_SKY), HALL_CELL)
    expect(Math.abs(actual - expected)).toBeLessThan(TOLERANCE)
  })

  it('keeps one half for a doorway into a room open to the sky', () => {
    const solver = createDaylightFieldSolver([{ ...testRoom, openToSky: true }, hall])
    const expected = WINDOW_SKY_SHARE * DOORWAY_AREA * DOORWAY_TRANSMITTANCE
    expect(relativeError(solver.enteringFlux(1, UNIFORM_SKY), expected)).toBeLessThan(
      RATIO_TOLERANCE,
    )
  })
})
