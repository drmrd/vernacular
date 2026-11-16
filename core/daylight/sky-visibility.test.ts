// core/daylight/sky-visibility.test.ts
import { describe, expect, it } from 'vitest'
import { srgbToLinear } from '../color/oklab'
import type { Point } from '../model/types'
import type { Vector3 } from '../scene/vector3'
import {
  SKY_VISIBILITY_CHANNEL,
  daylightFieldCellIndex,
  sampleSkyVisibility,
} from './daylight-field'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { horizontalPointToWallRectangle } from './form-factor'
import {
  DAYLIGHT_WORK_PLANE_HEIGHT_MM,
  UNIFORM_SKY,
  UNPAINTED_SURFACE_REFLECTANCE,
  createDaylightFieldSolver,
} from './sky-visibility'
import type { SkyLuminance } from './sky-visibility'

const TOLERANCE = 1e-6
const REFLECTANCE_TOLERANCE = 0.005
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const REVEAL_DEPTH = 120
const CELL_CENTER = { x: 3050, y: 1550 }
const EAST_SKY_FACTOR = 2
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 }
const UNPAINTED_SURFACE_SRGB_BYTES = { r: 0xd8, g: 0xd4, b: 0xcc }
const BYTE_MAX = 255

const NARROW_SPAN: readonly [Point, Point] = [
  { x: ROOM_WIDTH, y: 1000 },
  { x: ROOM_WIDTH, y: 2000 },
]
const WIDE_SPAN: readonly [Point, Point] = [
  { x: ROOM_WIDTH, y: 500 },
  { x: ROOM_WIDTH, y: 2500 },
]

interface RoomOptions {
  span?: readonly [Point, Point]
  revealDepth?: number
  openToSky?: boolean
  offset?: number
}

function eastWindowRoom({
  span = NARROW_SPAN,
  revealDepth = 0,
  openToSky,
  offset = 0,
}: RoomOptions = {}): DaylightRoom {
  const shifted = (point: Point): Point => ({ x: point.x + offset, y: point.y })
  const low = shifted({ x: 0, y: 0 })
  const high = shifted({ x: ROOM_WIDTH, y: ROOM_DEPTH })
  return {
    outline: [low, { x: high.x, y: low.y }, high, { x: low.x, y: high.y }],
    ceilingHeight: CEILING_HEIGHT,
    floorColor: { r: 0.5, g: 0.5, b: 0.5 },
    apertures: [
      {
        span: [shifted(span[0]), shifted(span[1])],
        sill: SILL,
        head: HEAD,
        revealDepth,
        opensTo: 'sky',
      },
    ],
    ...(openToSky === undefined ? {} : { openToSky }),
  }
}

function fieldOf(room: DaylightRoom, sky: SkyLuminance = UNIFORM_SKY): DaylightField {
  return createDaylightFieldSolver([room]).field(sky)
}

function visibilityAt(field: DaylightField, column: number, row: number): number {
  return field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN
}

function allVisibilities(field: DaylightField): number[] {
  return Array.from({ length: field.columns * field.rows }, (_, cell) =>
    visibilityAt(field, cell % field.columns, Math.floor(cell / field.columns)),
  )
}

function luminanceOfBytes(bytes: { r: number; g: number; b: number }): number {
  const linear = (byte: number): number => srgbToLinear(byte / BYTE_MAX)
  return (
    LUMINANCE_WEIGHTS.r * linear(bytes.r) +
    LUMINANCE_WEIGHTS.g * linear(bytes.g) +
    LUMINANCE_WEIGHTS.b * linear(bytes.b)
  )
}

describe('the daylight field solver', () => {
  it('holds the form factor of the cell center plus the interreflection in a window-lit cell', () => {
    const solver = createDaylightFieldSolver([eastWindowRoom()])
    const footToWallMm = ROOM_WIDTH - CELL_CENTER.x
    const aboveWorkPlane = (height: number): number => height - DAYLIGHT_WORK_PLANE_HEIGHT_MM
    const factor = horizontalPointToWallRectangle(
      {
        x0: NARROW_SPAN[0].y - CELL_CENTER.y,
        x1: NARROW_SPAN[1].y - CELL_CENTER.y,
        z0: aboveWorkPlane(SILL),
        z1: aboveWorkPlane(HEAD),
      },
      footToWallMm,
    )
    const expected = factor + solver.interreflection(0, UNIFORM_SKY)
    const sampled = sampleSkyVisibility(solver.field(UNIFORM_SKY), CELL_CENTER)
    expect(Math.abs(sampled - expected)).toBeLessThan(TOLERANCE)
  })

  it('holds 1 in every cell of a room that is open to the sky', () => {
    const visibilities = allVisibilities(fieldOf(eastWindowRoom({ openToSky: true })))
    expect(visibilities.every((visibility) => visibility === 1)).toBe(true)
  })

  it('holds 1 in a cell whose center lies in no room', () => {
    const rooms = [eastWindowRoom(), eastWindowRoom({ offset: 2 * ROOM_WIDTH })]
    const field = createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
    const gapPoint = { x: ROOM_WIDTH + ROOM_WIDTH / 2, y: ROOM_DEPTH / 2 }
    expect(sampleSkyVisibility(field, gapPoint)).toBe(1)
  })

  it('gives a field that is symmetric about the middle line of the window', () => {
    const field = fieldOf(eastWindowRoom())
    const mirroredRow = (row: number): number => field.rows - 1 - row
    const gaps = Array.from({ length: field.columns * field.rows }, (_, cell) => {
      const [column, row] = [cell % field.columns, Math.floor(cell / field.columns)]
      return Math.abs(
        visibilityAt(field, column, row) - visibilityAt(field, column, mirroredRow(row)),
      )
    })
    expect(Math.max(...gaps)).toBeLessThan(TOLERANCE)
  })

  it('lowers no cell when the window is made wider', () => {
    const narrow = allVisibilities(fieldOf(eastWindowRoom()))
    const wide = allVisibilities(fieldOf(eastWindowRoom({ span: WIDE_SPAN })))
    expect(wide.every((visibility, cell) => visibility >= (narrow[cell] ?? NaN) - TOLERANCE)).toBe(
      true,
    )
  })

  it('raises no cell when the window gains a reveal', () => {
    const flat = allVisibilities(fieldOf(eastWindowRoom()))
    const deep = allVisibilities(fieldOf(eastWindowRoom({ revealDepth: REVEAL_DEPTH })))
    expect(deep.every((visibility, cell) => visibility <= (flat[cell] ?? NaN) + TOLERANCE)).toBe(
      true,
    )
  })

  it('doubles the direct term of the east window under a sky twice as bright toward the east', () => {
    const brighterEast: SkyLuminance = (direction: Vector3) =>
      direction.x > 0 ? EAST_SKY_FACTOR : 1
    const solver = createDaylightFieldSolver([eastWindowRoom()])
    const [uniform, east] = [solver.field(UNIFORM_SKY), solver.field(brighterEast)]
    const directTerm = (field: DaylightField, sky: SkyLuminance, point: Point): number =>
      sampleSkyVisibility(field, point) - solver.interreflection(0, sky)
    const points = [{ x: 1050, y: 1550 }, { x: 2050, y: 1550 }, CELL_CENTER, { x: 2050, y: 550 }]
    const gaps = points.map((point) =>
      Math.abs(
        directTerm(east, brighterEast, point) -
          EAST_SKY_FACTOR * directTerm(uniform, UNIFORM_SKY, point),
      ),
    )
    expect(Math.max(...gaps)).toBeLessThan(TOLERANCE)
  })

  it('computes the geometry once however many skies it is asked about', () => {
    const solver = createDaylightFieldSolver([eastWindowRoom()])
    solver.field(UNIFORM_SKY)
    solver.field((direction: Vector3) => (direction.x > 0 ? EAST_SKY_FACTOR : 1))
    solver.field(UNIFORM_SKY)
    expect(solver.geometryPasses).toBe(1)
  })
})

describe('UNPAINTED_SURFACE_REFLECTANCE', () => {
  it('is the luminance of the unpainted surface color #d8d4cc', () => {
    const expected = luminanceOfBytes(UNPAINTED_SURFACE_SRGB_BYTES)
    expect(Math.abs(UNPAINTED_SURFACE_REFLECTANCE - expected)).toBeLessThan(REFLECTANCE_TOLERANCE)
  })
})
