// core/daylight/doorway-luminance.test.ts
import { describe, expect, it } from 'vitest'
import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'
import { sampleSkyVisibility } from './daylight-field'
import type { DaylightAperture, DaylightRoom } from './daylight-field'
import { horizontalPointToWallRectangle } from './form-factor'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const TOLERANCE = 1e-6
const CELL_SIZE = 100
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const HALL_WIDTH = 2000
const CEILING_HEIGHT = 2600
const WINDOW_SILL = 900
const DOORWAY_HEAD = 2100
const DOORWAY_WIDTH = 1000
const WORK_PLANE_HEIGHT = 850
// The test room: (12e6 * 0.5 + 48.4e6 * 0.66) / 60.4e6, the floor at 0.5 and the rest unpainted.
const TEST_ROOM_REFLECTANCE = 0.6282119
const GRAY: LinearRgb = { r: 0.5, g: 0.5, b: 0.5 }
const WHITE: LinearRgb = { r: 1, g: 1, b: 1 }

function rectangleOutline(x0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function verticalSpan(x: number, y0: number, y1: number): readonly [Point, Point] {
  return [
    { x, y: y0 },
    { x, y: y1 },
  ]
}

const testRoom: DaylightRoom = {
  outline: rectangleOutline(0, ROOM_WIDTH, ROOM_DEPTH),
  ceilingHeight: CEILING_HEIGHT,
  floorColor: GRAY,
  apertures: [
    {
      span: verticalSpan(ROOM_WIDTH, 1000, 2000),
      sill: WINDOW_SILL,
      head: DOORWAY_HEAD,
      revealDepth: 0,
      opensTo: 'sky',
    },
  ],
}

const hall: DaylightRoom = {
  outline: rectangleOutline(-HALL_WIDTH, 0, ROOM_DEPTH),
  ceilingHeight: CEILING_HEIGHT,
  floorColor: GRAY,
  apertures: [
    {
      span: verticalSpan(0, 1000, 2000),
      sill: 0,
      head: DOORWAY_HEAD,
      revealDepth: 0,
      opensTo: { room: 0 },
    },
  ],
}

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
      { x0: -550, x1: 450, z0: 0, z1: DOORWAY_HEAD - WORK_PLANE_HEIGHT },
      950,
    )
    const expected =
      doorwayFromCell * mean * TEST_ROOM_REFLECTANCE + solver.interreflection(1, UNIFORM_SKY)
    const actual = sampleSkyVisibility(field, { x: -950, y: 1550 })
    expect(Math.abs(actual - expected)).toBeLessThan(TOLERANCE)
  })
})

describe('a hall never receives more flux than the room that lights it', () => {
  const sweep = [
    { width: 500, depth: 6000 },
    { width: 1000, depth: 6000 },
    { width: 1000, depth: 10000 },
    { width: 2000, depth: 8000 },
  ].flatMap((size) =>
    [GRAY, WHITE].map((floorColor) => ({ ...size, floorColor, label: floorColor.r })),
  )

  function sourceAndHall(width: number, depth: number, floorColor: LinearRgb): DaylightRoom[] {
    const window: DaylightAperture = {
      span: [
        { x: 0, y: depth },
        { x: width, y: depth },
      ],
      sill: 0,
      head: CEILING_HEIGHT,
      revealDepth: 0,
      opensTo: 'sky',
    }
    const doorway: DaylightAperture = {
      span: verticalSpan(width, 0, depth),
      sill: 0,
      head: CEILING_HEIGHT,
      revealDepth: 0,
      opensTo: { room: 0 },
    }
    return [
      {
        outline: rectangleOutline(0, width, depth),
        ceilingHeight: CEILING_HEIGHT,
        floorColor,
        apertures: [window],
      },
      {
        outline: rectangleOutline(width, width + 3000, depth),
        ceilingHeight: CEILING_HEIGHT,
        floorColor: GRAY,
        apertures: [doorway],
      },
    ]
  }

  it.each(sweep)(
    'holds for a source $width by $depth mm with a floor of reflectance $label',
    ({ width, depth, floorColor }) => {
      const solver = createDaylightFieldSolver(sourceAndHall(width, depth, floorColor))
      expect(solver.enteringFlux(1, UNIFORM_SKY)).toBeLessThan(solver.enteringFlux(0, UNIFORM_SKY))
    },
  )
})
