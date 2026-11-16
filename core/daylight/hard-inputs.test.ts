// core/daylight/hard-inputs.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import { horizontalPointToWallRectangle, visibleThroughReveal } from './form-factor'
import type { WallRectangle } from './form-factor'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const TOLERANCE = 1e-6
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const FAR_OFFSET = 10000
const QUARTER_SPACE = 0.25
const HALF_SPACE = 0.5
const OUTSIDE_BY_MM = 60
const DISTANCE = 1000
const REVEAL_DEPTH = 120

const WINDOW: WallRectangle = { x0: -500, x1: 500, z0: 50, z1: 1250 }
const EAST_SPAN: readonly [Point, Point] = [
  { x: ROOM_WIDTH, y: 1000 },
  { x: ROOM_WIDTH, y: 2000 },
]

function window(span: readonly [Point, Point] = EAST_SPAN): DaylightAperture {
  return { span, sill: 900, head: 2100, revealDepth: 0, opensTo: 'sky' }
}

function room(apertures: readonly DaylightAperture[], offset = 0): DaylightRoom {
  const [x0, x1] = [offset, offset + ROOM_WIDTH]
  return {
    outline: [
      { x: x0, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: ROOM_DEPTH },
      { x: x0, y: ROOM_DEPTH },
    ],
    ceilingHeight: 2600,
    floorColor: { r: 0.5, g: 0.5, b: 0.5 },
    apertures,
  }
}

/** Room 0 is sound; room 1 holds a sound window (aperture 0) then `second` (aperture 1). */
function floorWithSecondAperture(second: DaylightAperture): DaylightRoom[] {
  return [room([window()]), room([window(shifted(EAST_SPAN, FAR_OFFSET)), second], FAR_OFFSET)]
}

function shifted(span: readonly [Point, Point], dx: number): readonly [Point, Point] {
  return [
    { x: span[0].x + dx, y: span[0].y },
    { x: span[1].x + dx, y: span[1].y },
  ]
}

function solve(rooms: readonly DaylightRoom[]): DaylightField {
  return createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
}

function expectRangeErrorNaming(rooms: readonly DaylightRoom[], ...names: RegExp[]): void {
  expect(() => solve(rooms)).toThrow(RangeError)
  names.forEach((name) => expect(() => solve(rooms)).toThrow(name))
}

describe('apertures whose span cannot be used', () => {
  it('throws a RangeError that names the room and the aperture when the span lies off the outline', () => {
    const offOutline = shifted(EAST_SPAN, FAR_OFFSET + OUTSIDE_BY_MM)
    expectRangeErrorNaming(floorWithSecondAperture(window(offOutline)), /room 1\b/, /aperture 1\b/)
  })

  it('throws a RangeError that names the room and the aperture when the span has no length', () => {
    const point = { x: FAR_OFFSET + ROOM_WIDTH, y: 1500 }
    expectRangeErrorNaming(
      floorWithSecondAperture(window([point, point])),
      /room 1\b/,
      /aperture 1\b/,
    )
  })

  it('solves a window on the outline without an error', () => {
    expect(() =>
      solve(floorWithSecondAperture(window(shifted(EAST_SPAN, FAR_OFFSET)))),
    ).not.toThrow()
  })
})

describe('horizontalPointToWallRectangle with degenerate input', () => {
  it('gives 0 for a rectangle whose x extent is empty', () => {
    expect(horizontalPointToWallRectangle({ ...WINDOW, x0: 200, x1: 200 }, DISTANCE)).toBe(0)
  })

  it('gives 0 for a rectangle whose x extent is inverted', () => {
    expect(horizontalPointToWallRectangle({ ...WINDOW, x0: 500, x1: -500 }, DISTANCE)).toBe(0)
  })

  it('gives 0 when the distance is not a number', () => {
    expect(horizontalPointToWallRectangle(WINDOW, NaN)).toBe(0)
  })

  it.each(['x0', 'x1', 'z0', 'z1'] as const)('gives 0 when %s is not a number', (edge) => {
    expect(horizontalPointToWallRectangle({ ...WINDOW, [edge]: NaN }, DISTANCE)).toBe(0)
  })

  it('gives one quarter for a quadrant that has no end in x or in z', () => {
    const quadrant: WallRectangle = { x0: 0, x1: Infinity, z0: 0, z1: Infinity }
    const value = horizontalPointToWallRectangle(quadrant, DISTANCE)
    expect(Math.abs(value - QUARTER_SPACE)).toBeLessThan(TOLERANCE)
  })

  it('gives one half for the half-space above the plane of the point', () => {
    const halfSpace: WallRectangle = { x0: -Infinity, x1: Infinity, z0: 0, z1: Infinity }
    const value = horizontalPointToWallRectangle(halfSpace, DISTANCE)
    expect(Math.abs(value - HALF_SPACE)).toBeLessThan(TOLERANCE)
  })
})

describe('visibleThroughReveal with degenerate input', () => {
  it.each([
    [0, 0],
    [-100, 50],
    [100, -100],
    [-100, -50],
  ])('gives null when the distance is %d and the depth is %d', (distance, depth) => {
    expect(visibleThroughReveal(WINDOW, { distance, depth })).toBeNull()
  })

  it('gives null when the distance is not a number', () => {
    expect(visibleThroughReveal(WINDOW, { distance: NaN, depth: REVEAL_DEPTH })).toBeNull()
  })

  it('gives null when the depth is not a number', () => {
    expect(visibleThroughReveal(WINDOW, { distance: DISTANCE, depth: NaN })).toBeNull()
  })

  it('gives null when an edge of the opening is not a number', () => {
    const reveal = { distance: DISTANCE, depth: REVEAL_DEPTH }
    expect(visibleThroughReveal({ ...WINDOW, x1: NaN }, reveal)).toBeNull()
  })
})

describe('a solved field is finite', () => {
  const finiteField = (field: DaylightField): boolean =>
    [field.origin.x, field.origin.y, field.cellSize, field.columns, field.rows].every(
      Number.isFinite,
    ) && Array.from(field.data).every(Number.isFinite)

  it('holds only finite values for a floor with no rooms', () => {
    expect(finiteField(solve([]))).toBe(true)
  })

  it('holds only finite values for a room that has a window', () => {
    expect(finiteField(solve([room([window()])]))).toBe(true)
  })

  it.each([0, 1, 2])(
    'throws a RangeError that names the room when its outline has %d points',
    (count) => {
      const thin: DaylightRoom = { ...room([]), outline: room([]).outline.slice(0, count) }
      expectRangeErrorNaming([room([window()]), thin], /room 1\b/)
    },
  )
})
