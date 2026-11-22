// core/daylight/doorway-luminance.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { sampleSkyVisibility } from './daylight-field'
import type { DaylightRoom } from './daylight-field'
import { hall, testRoom } from './doorway-test-support'
import { horizontalPointToWallRectangle } from './form-factor'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const TOLERANCE = 1e-6
const CELL_SIZE = 100
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const DOORWAY_HEAD = 2100
const DOORWAY_START = 1000
const DOORWAY_END = 2000
const DOORWAY_WIDTH = DOORWAY_END - DOORWAY_START
const WORK_PLANE_HEIGHT = 850
// (12e6 * 0.5 + 48.4e6 * 0.66) / (60.4e6 + 2.1e6): the hall's doorway joins the test room's
// surfaces at reflectance 0.
const TEST_ROOM_REFLECTANCE = 0.607104
// The hall cell that the second test samples: 950 mm from the doorway wall (x = 0) and level with
// the doorway's middle, so the doorway lies 550 mm to one side and 450 mm to the other.
const HALL_CELL: Point = { x: -950, y: 1550 }

function meanVisibilityOfTestRoom(rooms: readonly DaylightRoom[]): number {
  const field = createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
  const columns = ROOM_WIDTH / CELL_SIZE
  const rows = ROOM_DEPTH / CELL_SIZE
  const samples = Array.from({ length: columns * rows }, (_, cell) =>
    sampleSkyVisibility(field, {
      x: (Math.floor(cell / rows) + 0.5) * CELL_SIZE,
      y: ((cell % rows) + 0.5) * CELL_SIZE,
    }),
  )
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

describe('a doorway weighs the luminance of the room it opens to', () => {
  const rooms = [testRoom, hall]

  it('passes the neighbor mean visibility times its mean reflectance into the hall', () => {
    const mean = meanVisibilityOfTestRoom(rooms)
    const solver = createDaylightFieldSolver(rooms)
    const expected = 0.5 * DOORWAY_WIDTH * DOORWAY_HEAD * mean * TEST_ROOM_REFLECTANCE
    expect(Math.abs(solver.enteringFlux(1, UNIFORM_SKY) / expected - 1)).toBeLessThan(TOLERANCE)
  })

  it('lights a hall cell by the doorway form factor times that luminance plus the bounce', () => {
    const mean = meanVisibilityOfTestRoom(rooms)
    const solver = createDaylightFieldSolver(rooms)
    const field = solver.field(UNIFORM_SKY)
    const doorwayFromCell = horizontalPointToWallRectangle(
      {
        x0: DOORWAY_START - HALL_CELL.y,
        x1: DOORWAY_END - HALL_CELL.y,
        z0: 0,
        z1: DOORWAY_HEAD - WORK_PLANE_HEIGHT,
      },
      -HALL_CELL.x,
    )
    const expected =
      doorwayFromCell * mean * TEST_ROOM_REFLECTANCE + solver.interreflection(1, UNIFORM_SKY)
    const actual = sampleSkyVisibility(field, HALL_CELL)
    expect(Math.abs(actual - expected)).toBeLessThan(TOLERANCE)
  })
})
