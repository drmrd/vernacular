// core/daylight/room-validation.test.ts
import { describe, expect, it } from 'vitest'
import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const FAR_OFFSET = 10000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const PAST_THE_CORNER = 500

const EAST_X = FAR_OFFSET + ROOM_WIDTH
const BLACK: LinearRgb = { r: 0, g: 0, b: 0 }
const WHITE: LinearRgb = { r: 1, g: 1, b: 1 }

const FIRST_WINDOW_SPAN: readonly [Point, Point] = [
  { x: EAST_X, y: 1000 },
  { x: EAST_X, y: 2000 },
]
const SECOND_SPAN: readonly [Point, Point] = [
  { x: EAST_X, y: 2200 },
  { x: EAST_X, y: 2800 },
]

function aperture(
  span: readonly [Point, Point],
  changes: Partial<DaylightAperture> = {},
): DaylightAperture {
  return { span, sill: SILL, head: HEAD, revealDepth: 0, opensTo: 'sky', ...changes }
}

function soundRoom(offset = 0): DaylightRoom {
  const [x0, x1] = [offset, offset + ROOM_WIDTH]
  const east: readonly [Point, Point] = [
    { x: x1, y: 1000 },
    { x: x1, y: 2000 },
  ]
  return {
    outline: [
      { x: x0, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: ROOM_DEPTH },
      { x: x0, y: ROOM_DEPTH },
    ],
    ceilingHeight: CEILING_HEIGHT,
    floorColor: { r: 0.5, g: 0.5, b: 0.5 },
    apertures: [aperture(east)],
  }
}

/** Room 0 is sound; room 1 is sound apart from `changes`. Its aperture 0 is a sound window. */
function floorWithRoom(changes: Partial<DaylightRoom>): DaylightRoom[] {
  return [soundRoom(), { ...soundRoom(FAR_OFFSET), ...changes }]
}

/** Room 1 holds a sound window (aperture 0) then `second` (aperture 1). */
function floorWithSecondAperture(second: DaylightAperture): DaylightRoom[] {
  const apertures = [aperture(FIRST_WINDOW_SPAN), second]
  return floorWithRoom({ apertures })
}

function solve(rooms: readonly DaylightRoom[]): DaylightField {
  return createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
}

function expectRangeErrorNaming(rooms: readonly DaylightRoom[], ...names: RegExp[]): void {
  expect(() => solve(rooms)).toThrow(RangeError)
  names.forEach((name) => expect(() => solve(rooms)).toThrow(name))
}

function expectSecondApertureRefused(changes: Partial<DaylightAperture>): void {
  const rooms = floorWithSecondAperture(aperture(SECOND_SPAN, changes))
  expectRangeErrorNaming(rooms, /room 1\b/, /aperture 1\b/)
}

function expectSecondSpanRefused(span: readonly [Point, Point]): void {
  expectRangeErrorNaming(floorWithSecondAperture(aperture(span)), /room 1\b/, /aperture 1\b/)
}

describe('a room whose height or floor color cannot be used', () => {
  it.each([NaN, Infinity, 0, -2600])(
    'throws a RangeError that names the room when its ceiling height is %d',
    (ceilingHeight) => {
      expectRangeErrorNaming(floorWithRoom({ ceilingHeight }), /room 1\b/)
    },
  )

  it.each(['r', 'g', 'b'] as const)(
    'throws a RangeError that names the room when the %s channel of its floor color is not a number',
    (channel) => {
      const floorColor: LinearRgb = { r: 0.5, g: 0.5, b: 0.5, [channel]: NaN }
      expectRangeErrorNaming(floorWithRoom({ floorColor }), /room 1\b/)
    },
  )
})

describe('an aperture whose heights or reveal cannot be used', () => {
  it.each(['sill', 'head', 'revealDepth'] as const)(
    'throws a RangeError that names the room and the aperture when its %s is not a number',
    (key) => {
      expectSecondApertureRefused({ [key]: NaN })
    },
  )

  it('throws a RangeError that names the room and the aperture when its reveal depth is negative', () => {
    expectSecondApertureRefused({ revealDepth: -120 })
  })

  it('throws a RangeError that names the room and the aperture when its head equals its sill', () => {
    expectSecondApertureRefused({ sill: SILL, head: SILL })
  })

  it('throws a RangeError that names the room and the aperture when its head is below its sill', () => {
    expectSecondApertureRefused({ sill: SILL, head: SILL - 100 })
  })

  it('throws a RangeError that names the room and the aperture when its head is above the ceiling', () => {
    expectSecondApertureRefused({ head: CEILING_HEIGHT + 100 })
  })
})

describe('an aperture whose span ends off the outline while its midpoint is on it', () => {
  it('throws a RangeError that names the room and the aperture when the span runs past both corners', () => {
    expectSecondSpanRefused([
      { x: EAST_X, y: -PAST_THE_CORNER },
      { x: EAST_X, y: ROOM_DEPTH + PAST_THE_CORNER },
    ])
  })

  it('throws a RangeError that names the room and the aperture when a diagonal span has ends off the outline', () => {
    expectSecondSpanRefused([
      { x: EAST_X - PAST_THE_CORNER, y: 500 },
      { x: EAST_X + PAST_THE_CORNER, y: 1500 },
    ])
  })
})

describe('inputs on the edge of what is allowed', () => {
  const finite = (field: DaylightField): boolean => Array.from(field.data).every(Number.isFinite)

  it('solves a window whose head equals the ceiling height exactly', () => {
    const rooms = floorWithSecondAperture(aperture(SECOND_SPAN, { head: CEILING_HEIGHT }))
    expect(() => solve(rooms)).not.toThrow()
    expect(finite(solve(rooms))).toBe(true)
  })

  it('solves a window whose span ends exactly at the two corners of its wall', () => {
    const wall: readonly [Point, Point] = [
      { x: EAST_X, y: 0 },
      { x: EAST_X, y: ROOM_DEPTH },
    ]
    const rooms = floorWithRoom({ apertures: [aperture(wall)] })
    expect(() => solve(rooms)).not.toThrow()
    expect(finite(solve(rooms))).toBe(true)
  })

  it('solves a window with a reveal depth of 0', () => {
    const rooms = floorWithSecondAperture(aperture(SECOND_SPAN, { revealDepth: 0 }))
    expect(() => solve(rooms)).not.toThrow()
    expect(finite(solve(rooms))).toBe(true)
  })

  it.each([
    ['black', BLACK],
    ['white', WHITE],
  ])('solves a room with a pure %s floor', (_name, floorColor) => {
    const rooms = floorWithRoom({ floorColor })
    expect(() => solve(rooms)).not.toThrow()
    expect(finite(solve(rooms))).toBe(true)
  })
})
