// core/daylight/doorway-balance.test.ts
import { describe, expect, it } from 'vitest'
import { sampleSkyVisibility } from './daylight-field'
import type { DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import {
  DOORWAY_AREA,
  SECOND_DOORWAY_EXCHANGE_AREA,
  STRAIGHT_ON_EXCHANGE_AREA,
  WINDOW_FLUX,
  WINDOW_TRANSMITTANCE,
  hall,
  testRoom,
  verticalSpan,
} from './doorway-test-support'

const TOLERANCE = 1e-9
const CELL_SIZE = 100
const COLUMNS = 40
const ROWS = 30
const FIELD_TOLERANCE = 1e-6
// The floor reflects half of what stays.
const FLOOR_REFLECTANCE = 0.5
// The window light that lands on the hall's doorway leaves the room before the first reflection.
const ROUTED_FLUX = WINDOW_TRANSMITTANCE * STRAIGHT_ON_EXCHANGE_AREA
const SECOND_ROUTED_FLUX = WINDOW_TRANSMITTANCE * SECOND_DOORWAY_EXCHANGE_AREA
// S (1 - rho) of the test room: S = 60.4e6, floor 12e6 at 0.5, the rest 48.4e6 at 0.66.
const ROOM_ABSORBING_AREA = 60.4e6 - 12e6 * 0.5 - 48.4e6 * 0.66
const SECOND_DOORWAY_AREA = 600 * 2100
// S (1 - rho) of the hall: S = 38e6, floor 3e6 at 0.5, the rest 32e6 at 0.66.
const HALL_ABSORBING_AREA = 38e6 - 3e6 - 32e6 * 0.66
const HALL_FLOOR_REFLECTANCE = 0.5
const GLAZED_DOORWAY_TRANSMITTANCE = 0.5

const glazedHall: DaylightRoom = {
  ...hall,
  apertures: hall.apertures.map((aperture) => ({
    ...aperture,
    netTransmittance: GLAZED_DOORWAY_TRANSMITTANCE,
  })),
}

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

function interreflectionOf(rooms: readonly DaylightRoom[], room: number): number {
  return createDaylightFieldSolver(rooms).interreflection(room, UNIFORM_SKY)
}

const hallWithSecondDoorway: DaylightRoom = {
  ...hall,
  apertures: [
    ...hall.apertures,
    {
      span: verticalSpan(0, 2200, 2800),
      sill: 0,
      head: 2100,
      revealDepth: 0,
      opensTo: { room: 0 },
    },
  ],
}

describe('a doorway counts in the balance of the room it opens into as a surface that reflects nothing', () => {
  it('keeps F rhoFloor / (S (1 - rho)) for a room that no doorway opens into', () => {
    const expected = (WINDOW_FLUX * FLOOR_REFLECTANCE) / ROOM_ABSORBING_AREA
    expect(expected).toBeCloseTo(0.0106875668, 10)
    expect(relativeError(interreflectionOf([testRoom], 0), expected)).toBeLessThan(TOLERANCE)
  })

  it('adds the area of a doorway that opens into the room to its balance at reflectance 0', () => {
    const expected =
      ((WINDOW_FLUX - ROUTED_FLUX) * FLOOR_REFLECTANCE) / (ROOM_ABSORBING_AREA + DOORWAY_AREA)
    expect(expected).toBeCloseTo(0.0092548364, 10)
    expect(relativeError(interreflectionOf([testRoom, hall], 0), expected)).toBeLessThan(TOLERANCE)
  })

  it('adds every doorway that opens into the room', () => {
    const expected =
      ((WINDOW_FLUX - ROUTED_FLUX - SECOND_ROUTED_FLUX) * FLOOR_REFLECTANCE) /
      (ROOM_ABSORBING_AREA + DOORWAY_AREA + SECOND_DOORWAY_AREA)
    expect(expected).toBeCloseTo(0.0085365986, 10)
    const rooms = [testRoom, hallWithSecondDoorway]
    expect(relativeError(interreflectionOf(rooms, 0), expected)).toBeLessThan(TOLERANCE)
  })

  it('does not count a doorway in the balance of the room that lists it', () => {
    const rooms = [testRoom, hall]
    const flux = createDaylightFieldSolver(rooms).enteringFlux(1, UNIFORM_SKY)
    const expected = (flux * HALL_FLOOR_REFLECTANCE) / HALL_ABSORBING_AREA
    expect(relativeError(interreflectionOf(rooms, 1), expected)).toBeLessThan(TOLERANCE)
  })

  it('takes the routed window light and a hole of the full doorway area from the source balance when the doorway glazing passes half the light', () => {
    const rooms = [testRoom, glazedHall]
    const expectedBalance =
      ((WINDOW_FLUX - ROUTED_FLUX) * FLOOR_REFLECTANCE) / (ROOM_ABSORBING_AREA + DOORWAY_AREA)
    expect(expectedBalance).toBeCloseTo(0.0092548364, 10)
    expect(relativeError(interreflectionOf(rooms, 0), expectedBalance)).toBeLessThan(TOLERANCE)

    const expectedFlux =
      GLAZED_DOORWAY_TRANSMITTANCE * (DOORWAY_AREA * expectedBalance + ROUTED_FLUX)
    expect(expectedFlux).toBeCloseTo(22455.8145, 4)
    const flux = createDaylightFieldSolver(rooms).enteringFlux(1, UNIFORM_SKY)
    expect(relativeError(flux, expectedFlux)).toBeLessThan(TOLERANCE)
  })

  it('darkens every cell of the source room by the light that leaves through the doorway', () => {
    const alone = createDaylightFieldSolver([testRoom]).field(UNIFORM_SKY)
    const withHall = createDaylightFieldSolver([testRoom, hall]).field(UNIFORM_SKY)
    const expectedChange = -(0.0106875668 - 0.0092548364)
    const changes = Array.from({ length: COLUMNS * ROWS }, (_, cell) => {
      const center = {
        x: (Math.floor(cell / ROWS) + 0.5) * CELL_SIZE,
        y: ((cell % ROWS) + 0.5) * CELL_SIZE,
      }
      return sampleSkyVisibility(withHall, center) - sampleSkyVisibility(alone, center)
    })
    for (const change of changes) {
      expect(Math.abs(change - expectedChange)).toBeLessThan(FIELD_TOLERANCE)
    }
  })
})
