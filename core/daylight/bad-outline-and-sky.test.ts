// core/daylight/bad-outline-and-sky.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import type { DaylightField, DaylightRoom } from './daylight-field'
import {
  DAYLIGHT_FIELD_VALUES_PER_CELL,
  SKY_VISIBILITY_CHANNEL,
  daylightFieldCellIndex,
} from './daylight-field'
import type { SkyLuminance } from './sky-visibility'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const FAR_OFFSET = 10000
const MIDDLE_COLUMN = 20
const MIDDLE_ROW = 15

function soundRoom(offset = 0): DaylightRoom {
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
    apertures: [
      {
        span: [
          { x: x1, y: 1000 },
          { x: x1, y: 2000 },
        ],
        sill: 900,
        head: 2100,
        revealDepth: 0,
        opensTo: 'sky',
      },
    ],
  }
}

/** Room 0 is sound; room 1 is sound apart from one coordinate of its first outline vertex. */
function floorWithBadCoordinate(axis: keyof Point, value: number): DaylightRoom[] {
  const room = soundRoom(FAR_OFFSET)
  const [first, ...rest] = room.outline
  if (first === undefined) throw new Error('the sound room has an outline')
  return [soundRoom(), { ...room, outline: [{ ...first, [axis]: value }, ...rest] }]
}

function expectRoomNamedInRangeError(rooms: readonly DaylightRoom[]): void {
  const solve = (): DaylightField => createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
  expect(solve).toThrow(RangeError)
  expect(solve).toThrow(/room 1\b/)
}

function skyVisibilities(field: DaylightField): number[] {
  const values = Array.from(field.data)
  return values.filter(
    (_value, index) => index % DAYLIGHT_FIELD_VALUES_PER_CELL === SKY_VISIBILITY_CHANNEL,
  )
}

describe('a room whose outline holds a coordinate that is not finite', () => {
  it.each(['x', 'y'] as const)(
    'throws a RangeError that names the room when a vertex %s is NaN',
    (axis) => {
      expectRoomNamedInRangeError(floorWithBadCoordinate(axis, NaN))
    },
  )

  it.each([Infinity, -Infinity])(
    'throws a RangeError that names the room when a vertex x is %d',
    (value) => {
      expectRoomNamedInRangeError(floorWithBadCoordinate('x', value))
    },
  )
})

describe('a sky whose radiance is outside the range of the unit sky', () => {
  const solver = createDaylightFieldSolver([soundRoom()])

  it.each([
    ['negative', () => -1],
    ['not a number', () => NaN],
  ] as [string, SkyLuminance][])(
    'keeps every sky visibility within 0 and 1, and the light of the room at 0 or more, for a sky that is %s',
    (_name, sky) => {
      skyVisibilities(solver.field(sky)).forEach((visibility) => {
        expect(Number.isFinite(visibility)).toBe(true)
        expect(visibility).toBeGreaterThanOrEqual(0)
        expect(visibility).toBeLessThanOrEqual(1)
      })
      for (const light of [solver.enteringFlux(0, sky), solver.interreflection(0, sky)]) {
        expect(Number.isFinite(light)).toBe(true)
        expect(light).toBeGreaterThanOrEqual(0)
      }
    },
  )

  it('holds zero inside the room and finite values everywhere for a sky that is black', () => {
    const field = solver.field(() => 0)
    const middle = daylightFieldCellIndex(field, MIDDLE_COLUMN, MIDDLE_ROW)
    const cell = Array.from(field.data.slice(middle, middle + DAYLIGHT_FIELD_VALUES_PER_CELL))
    expect(cell).toEqual([0, 0, 0, 0])
    expect(Array.from(field.data).every(Number.isFinite)).toBe(true)
  })

  it('holds sky visibility of at most 1 for a sky brighter than the unit sky', () => {
    skyVisibilities(solver.field(() => 2)).forEach((visibility) => {
      expect(visibility).toBeLessThanOrEqual(1)
    })
  })
})
