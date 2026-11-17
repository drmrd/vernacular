// core/daylight/room-average.test.ts
import { describe, expect, it } from 'vitest'
import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'
import {
  SKY_VISIBILITY_CHANNEL,
  daylightFieldCellIndex,
  sampleSkyVisibility,
} from './daylight-field'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import {
  DAYLIGHT_WORK_PLANE_HEIGHT_MM,
  UNIFORM_SKY,
  UNPAINTED_SURFACE_REFLECTANCE,
  createDaylightFieldSolver,
} from './sky-visibility'

const TOLERANCE = 1e-6
const TABULATED_TOLERANCE = 1e-5
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const TEST_ROOM_REGION = { x0: 0, x1: ROOM_WIDTH, depth: ROOM_DEPTH }
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const CELL_SIZE = 100
const GRAY: LinearRgb = { r: 0.5, g: 0.5, b: 0.5 }
const WHITE: LinearRgb = { r: 1, g: 1, b: 1 }
// Half of the opening area times the default net transmittance: 0.5 * 0.8 * 1000 * 1200.
const EXPECTED_FLUX = 480000
const EXPECTED_SURFACE_AREA = 60400000
// Flux times the floor reflectance over the absorbing area, for the first reflection:
// 480000 * 0.5 / 22456000, where 22456000 = 60400000 * (1 - 0.6282119) and 0.5 is the gray floor.
const EXPECTED_INTERREFLECTION = 0.010688
const EXPECTED_REFLECTANCE = 0.62821
// The direct term of the test room is 0.8 * 0.035785 = 0.028628; adding the inter-reflection of
// 0.010688 gives 0.039316. That is below 0.052570 (the mean with no glass loss) and above 0.0236,
// the rule of thumb for the same net transmittance.
const EXPECTED_MEAN_VISIBILITY = 0.039316

const EAST_SPAN: readonly [Point, Point] = [
  { x: ROOM_WIDTH, y: 1000 },
  { x: ROOM_WIDTH, y: 2000 },
]

function rectangleOutline(x0: number, x1: number, depth = ROOM_DEPTH): Point[] {
  return [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: depth },
    { x: x0, y: depth },
  ]
}

function eastWindow(sill: number, head: number, offset = 0): DaylightAperture {
  const [from, to] = EAST_SPAN
  const span: readonly [Point, Point] = [
    { x: from.x + offset, y: from.y },
    { x: to.x + offset, y: to.y },
  ]
  return { span, sill, head, revealDepth: 0, opensTo: 'sky' }
}

function testRoom(
  apertures: readonly DaylightAperture[] = [eastWindow(SILL, HEAD)],
  floorColor: LinearRgb = GRAY,
): DaylightRoom {
  return {
    outline: rectangleOutline(0, ROOM_WIDTH),
    ceilingHeight: CEILING_HEIGHT,
    floorColor,
    apertures,
  }
}

function visibilityAt(field: DaylightField, column: number, row: number): number {
  return field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN
}

interface Region {
  x0: number
  x1: number
  depth: number
}

function allVisibilities(field: DaylightField): number[] {
  return Array.from({ length: field.columns * field.rows }, (_, cell) =>
    visibilityAt(field, cell % field.columns, Math.floor(cell / field.columns)),
  )
}

/** Visibilities of the cells whose center lies inside the region; the margin cells are left out. */
function visibilitiesInside(field: DaylightField, { x0, x1, depth }: Region): number[] {
  const values: number[] = []
  for (let row = 0; row < field.rows; row++) {
    for (let column = 0; column < field.columns; column++) {
      const x = field.origin.x + (column + 0.5) * field.cellSize
      const y = field.origin.y + (row + 0.5) * field.cellSize
      if (x > x0 && x < x1 && y > 0 && y < depth) {
        values.push(visibilityAt(field, column, row))
      }
    }
  }
  return values
}

function meanOverRegion(field: DaylightField, { x0, x1, depth }: Region): number {
  const centers = (extent: number): number[] =>
    Array.from({ length: extent / CELL_SIZE }, (_, index) => (index + 0.5) * CELL_SIZE)
  const samples = centers(x1 - x0).flatMap((dx) =>
    centers(depth).map((y) => sampleSkyVisibility(field, { x: x0 + dx, y })),
  )
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

describe('the room-average term', () => {
  it('lets 480000 square millimetres of sky light into the test room through a window of net transmittance 0.8', () => {
    const solver = createDaylightFieldSolver([testRoom()])
    expect(solver.enteringFlux(0, UNIFORM_SKY)).toBeCloseTo(EXPECTED_FLUX, 3)
  })

  it('gives 0.010688 for the inter-reflection of the test room', () => {
    const solver = createDaylightFieldSolver([testRoom()])
    const gap = Math.abs(solver.interreflection(0, UNIFORM_SKY) - EXPECTED_INTERREFLECTION)
    expect(gap).toBeLessThan(TABULATED_TOLERANCE)
  })

  it('holds flux times the floor reflectance over the surface area and the absorbed share of the bounce', () => {
    const solver = createDaylightFieldSolver([testRoom()])
    const floorArea = ROOM_WIDTH * ROOM_DEPTH
    const perimeter = 2 * (ROOM_WIDTH + ROOM_DEPTH)
    const surfaceArea = 2 * floorArea + perimeter * CEILING_HEIGHT
    const reflectance =
      (floorArea * GRAY.g + (surfaceArea - floorArea) * UNPAINTED_SURFACE_REFLECTANCE) / surfaceArea
    const flux = solver.enteringFlux(0, UNIFORM_SKY)
    const bounce = solver.interreflection(0, UNIFORM_SKY)
    expect(Math.abs(surfaceArea - EXPECTED_SURFACE_AREA)).toBeLessThan(TOLERANCE)
    expect(Math.abs(reflectance - EXPECTED_REFLECTANCE)).toBeLessThan(TABULATED_TOLERANCE)
    expect(Math.abs(bounce * surfaceArea * (1 - reflectance) - flux * GRAY.g)).toBeLessThan(
      TOLERANCE,
    )
  })

  it('gives a mean of 0.039316 over the test room, toward the rule of thumb', () => {
    const field = createDaylightFieldSolver([testRoom()]).field(UNIFORM_SKY)
    const mean = meanOverRegion(field, { x0: 0, x1: ROOM_WIDTH, depth: ROOM_DEPTH })
    expect(Math.abs(mean - EXPECTED_MEAN_VISIBILITY)).toBeLessThan(TABULATED_TOLERANCE)
  })

  it('receives no more direct light on its cells than the flux that enters the room', () => {
    const solver = createDaylightFieldSolver([testRoom()])
    const bounce = solver.interreflection(0, UNIFORM_SKY)
    const direct = visibilitiesInside(solver.field(UNIFORM_SKY), TEST_ROOM_REGION).map(
      (visibility) => visibility - bounce,
    )
    expect(direct.length).toBeGreaterThan(0)
    const received = direct.reduce((sum, value) => sum + value, 0) * CELL_SIZE * CELL_SIZE
    expect(solver.enteringFlux(0, UNIFORM_SKY)).toBeGreaterThan(0)
    expect(received).toBeLessThanOrEqual(solver.enteringFlux(0, UNIFORM_SKY))
  })

  it('holds exactly the inter-reflection in every cell when the head is under the work plane', () => {
    const lowWindow = eastWindow(200, DAYLIGHT_WORK_PLANE_HEIGHT_MM - 50)
    const solver = createDaylightFieldSolver([testRoom([lowWindow])])
    const bounce = solver.interreflection(0, UNIFORM_SKY)
    const inside = visibilitiesInside(solver.field(UNIFORM_SKY), TEST_ROOM_REGION)
    expect(inside.length).toBeGreaterThan(0)
    const gaps = inside.map((value) => Math.abs(value - bounce))
    expect(bounce).toBeGreaterThan(0)
    expect(Math.max(...gaps)).toBeLessThan(TOLERANCE)
  })

  it('holds 0 in every cell of a room with no aperture', () => {
    const solver = createDaylightFieldSolver([testRoom([])])
    const values = visibilitiesInside(solver.field(UNIFORM_SKY), TEST_ROOM_REGION)
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((value) => value === 0)).toBe(true)
    expect(solver.enteringFlux(0, UNIFORM_SKY)).toBe(0)
    expect(solver.interreflection(0, UNIFORM_SKY)).toBe(0)
  })

  it('gives finite values and a positive inter-reflection for a white floor', () => {
    const solver = createDaylightFieldSolver([testRoom([eastWindow(SILL, HEAD)], WHITE)])
    const values = allVisibilities(solver.field(UNIFORM_SKY))
    expect(values.every(Number.isFinite)).toBe(true)
    expect(Number.isFinite(solver.interreflection(0, UNIFORM_SKY))).toBe(true)
    expect(solver.interreflection(0, UNIFORM_SKY)).toBeGreaterThan(0)
  })
})

describe('light borrowed through a doorway', () => {
  const HALL_WIDTH = 2000
  const doorway: DaylightAperture = {
    span: [
      { x: 0, y: 1000 },
      { x: 0, y: 2000 },
    ],
    sill: 0,
    head: HEAD,
    revealDepth: 0,
    opensTo: { room: 0 },
  }
  const hall: DaylightRoom = {
    outline: rectangleOutline(-HALL_WIDTH, 0),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: GRAY,
    apertures: [doorway],
  }

  it('gives a hall with one doorway and no window a mean above 0 and below the lit room', () => {
    const field = createDaylightFieldSolver([testRoom(), hall]).field(UNIFORM_SKY)
    const hallMean = meanOverRegion(field, { x0: -HALL_WIDTH, x1: 0, depth: ROOM_DEPTH })
    const roomMean = meanOverRegion(field, { x0: 0, x1: ROOM_WIDTH, depth: ROOM_DEPTH })
    expect(hallMean).toBeGreaterThan(0)
    expect(hallMean).toBeLessThan(roomMean)
  })

  it('lets less light into the hall than into the room that it borrows from', () => {
    const solver = createDaylightFieldSolver([testRoom(), hall])
    const borrowed = solver.enteringFlux(1, UNIFORM_SKY)
    expect(borrowed).toBeGreaterThan(0)
    expect(borrowed).toBeLessThan(solver.enteringFlux(0, UNIFORM_SKY))
  })

  it('holds 0 in two rooms that open only to each other, and returns', () => {
    const toNeighbor = (x: number, neighbor: number): DaylightAperture => ({
      ...doorway,
      span: [
        { x, y: 1000 },
        { x, y: 2000 },
      ],
      opensTo: { room: neighbor },
    })
    const rooms: DaylightRoom[] = [
      { ...hall, outline: rectangleOutline(0, ROOM_DEPTH), apertures: [toNeighbor(ROOM_DEPTH, 1)] },
      {
        ...hall,
        outline: rectangleOutline(ROOM_DEPTH, 2 * ROOM_DEPTH),
        apertures: [toNeighbor(ROOM_DEPTH, 0)],
      },
    ]
    const solver = createDaylightFieldSolver(rooms)
    const bothRooms = { x0: 0, x1: 2 * ROOM_DEPTH, depth: ROOM_DEPTH }
    const values = visibilitiesInside(solver.field(UNIFORM_SKY), bothRooms)
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((value) => value === 0)).toBe(true)
    expect(solver.enteringFlux(0, UNIFORM_SKY)).toBe(0)
    expect(solver.enteringFlux(1, UNIFORM_SKY)).toBe(0)
  })
})

describe('an aperture that names a room that cannot light it', () => {
  const NEIGHBOR_OFFSET = 5000
  const nameRoom = (room: number): DaylightAperture => ({
    ...eastWindow(0, HEAD, NEIGHBOR_OFFSET),
    opensTo: { room },
  })
  const secondRoom = (aperture: DaylightAperture): DaylightRoom => ({
    ...testRoom([aperture]),
    outline: rectangleOutline(NEIGHBOR_OFFSET, NEIGHBOR_OFFSET + ROOM_WIDTH),
  })
  const solve = (rooms: readonly DaylightRoom[]): unknown =>
    createDaylightFieldSolver(rooms).field(UNIFORM_SKY)

  it('throws a RangeError that names room 7 when only two rooms exist', () => {
    const rooms = [testRoom(), secondRoom(nameRoom(7))]
    expect(() => solve(rooms)).toThrow(RangeError)
    expect(() => solve(rooms)).toThrow(/\b7\b/)
  })

  it('throws a RangeError that names the room when an aperture opens to its own room', () => {
    const rooms = [testRoom(), secondRoom(nameRoom(1))]
    expect(() => solve(rooms)).toThrow(RangeError)
    expect(() => solve(rooms)).toThrow(/room 1\b/)
  })
})
