// core/daylight/angled-wall.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { sampleSkyVisibility } from './daylight-field'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const DEGREES_PER_HALF_TURN = 180
const WALL_LENGTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const FIRST_END = 0.25
const SECOND_END = 0.75
const MIDPOINT = 0.5
const INSET_FROM_WALL = 500
const OFF_BY_MM = 5
const ORIGIN: Point = { x: 3000.7, y: 1000.3 }
const ANGLES = [10, 30, 45, 60, 75]
const CONTROL_ANGLE = 30

interface Frame {
  readonly along: Point
  readonly inward: Point
  readonly start: Point
  readonly end: Point
  readonly room: (apertureSpan: readonly [Point, Point]) => DaylightRoom
}

function pointAt(from: Point, to: Point, t: number): Point {
  return { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) }
}

function moved(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + distance * direction.x, y: point.y + distance * direction.y }
}

/** A room whose first wall runs at `degrees` to the x axis; the room lies on that wall's left. */
function frameAt(degrees: number): Frame {
  const radians = (degrees * Math.PI) / DEGREES_PER_HALF_TURN
  const along: Point = { x: Math.cos(radians), y: Math.sin(radians) }
  const inward: Point = { x: -Math.sin(radians), y: Math.cos(radians) }
  const start = moved(ORIGIN, along, 0)
  const end = moved(ORIGIN, along, WALL_LENGTH)
  const outline = [start, end, moved(end, inward, ROOM_DEPTH), moved(start, inward, ROOM_DEPTH)]
  const room = (span: readonly [Point, Point]): DaylightRoom => ({
    outline,
    ceilingHeight: CEILING_HEIGHT,
    floorColor: { r: 0.5, g: 0.5, b: 0.5 },
    apertures: [{ span, sill: SILL, head: HEAD, revealDepth: 0, opensTo: 'sky' }],
  })
  return { along, inward, start, end, room }
}

function solve(room: DaylightRoom): DaylightField {
  return createDaylightFieldSolver([room]).field(UNIFORM_SKY)
}

function expectRefusedNamingRoomAndAperture(room: DaylightRoom): void {
  expect(() => solve(room)).toThrow(RangeError)
  expect(() => solve(room)).toThrow(/room 0\b/)
  expect(() => solve(room)).toThrow(/aperture 0\b/)
}

describe('a window on a wall that is not axis-aligned', () => {
  it.each(ANGLES)('is accepted and lights the room when its wall runs at %d degrees', (degrees) => {
    const frame = frameAt(degrees)
    const span: readonly [Point, Point] = [
      pointAt(frame.start, frame.end, FIRST_END),
      pointAt(frame.start, frame.end, SECOND_END),
    ]
    const room = frame.room(span)
    expect(() => solve(room)).not.toThrow()
    const field = solve(room)
    expect(Array.from(field.data).every(Number.isFinite)).toBe(true)
    const middle = pointAt(frame.start, frame.end, MIDPOINT)
    const justInside = moved(middle, frame.inward, INSET_FROM_WALL)
    expect(sampleSkyVisibility(field, justInside)).toBeGreaterThan(0)
  })

  it('is still refused when both span ends lie 5 mm off the outline', () => {
    const frame = frameAt(CONTROL_ANGLE)
    const span: readonly [Point, Point] = [
      moved(pointAt(frame.start, frame.end, FIRST_END), frame.inward, OFF_BY_MM),
      moved(pointAt(frame.start, frame.end, SECOND_END), frame.inward, OFF_BY_MM),
    ]
    expectRefusedNamingRoomAndAperture(frame.room(span))
  })

  it('is still refused when a span end lies 5 mm past the corner of its wall', () => {
    const frame = frameAt(CONTROL_ANGLE)
    const span: readonly [Point, Point] = [
      pointAt(frame.start, frame.end, FIRST_END),
      moved(frame.end, frame.along, OFF_BY_MM),
    ]
    expectRefusedNamingRoomAndAperture(frame.room(span))
  })
})
