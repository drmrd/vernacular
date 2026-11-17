// core/daylight/field-margin.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import {
  SKY_VISIBILITY_CHANNEL,
  createDaylightField,
  daylightFieldCellIndex,
  sampleSkyVisibility,
} from './daylight-field'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const FLOOR_COLOR = { r: 0.5, g: 0.5, b: 0.5 }
const SILL = 900
const HEAD = 2100
const OPEN_SKY = 1

function testRoom(): DaylightRoom {
  return {
    outline: [
      { x: 0, y: 0 },
      { x: ROOM_WIDTH, y: 0 },
      { x: ROOM_WIDTH, y: ROOM_DEPTH },
      { x: 0, y: ROOM_DEPTH },
    ],
    ceilingHeight: CEILING_HEIGHT,
    floorColor: FLOOR_COLOR,
    apertures: [
      {
        span: [
          { x: ROOM_WIDTH, y: 1000 },
          { x: ROOM_WIDTH, y: 2000 },
        ],
        sill: SILL,
        head: HEAD,
        revealDepth: 0,
        opensTo: 'sky',
      },
    ],
  }
}

function visibilityAt(field: DaylightField, column: number, row: number): number {
  return field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN
}

describe('the margin of the daylight field', () => {
  it('reaches two cells past the rooms on every side', () => {
    const field = createDaylightField([testRoom()])

    expect(field.origin).toEqual({ x: -200, y: -200 })
    expect([field.columns, field.rows]).toEqual([44, 34])
  })

  it('holds the value of the room in its first cell and open sky in its outer cell', () => {
    const field = createDaylightFieldSolver([testRoom()]).field(UNIFORM_SKY)
    const at = (x: number, y: number): number => sampleSkyVisibility(field, { x, y })
    const copiedPairs: [Point, Point][] = [
      [
        { x: -50, y: 1500 },
        { x: 50, y: 1500 },
      ],
      [
        { x: ROOM_WIDTH + 50, y: 1500 },
        { x: ROOM_WIDTH - 50, y: 1500 },
      ],
      [
        { x: 2000, y: -50 },
        { x: 2000, y: 50 },
      ],
      [
        { x: 2000, y: ROOM_DEPTH + 50 },
        { x: 2000, y: ROOM_DEPTH - 50 },
      ],
    ]
    const outerPoints: Point[] = [
      { x: -150, y: 1500 },
      { x: ROOM_WIDTH + 150, y: 1500 },
      { x: 2000, y: -150 },
      { x: 2000, y: ROOM_DEPTH + 150 },
    ]
    const lastColumn = field.columns - 1
    const lastRow = field.rows - 1
    const outermost = [
      ...Array.from({ length: field.rows }, (_, row) => [
        visibilityAt(field, 0, row),
        visibilityAt(field, lastColumn, row),
      ]),
      ...Array.from({ length: field.columns }, (_, column) => [
        visibilityAt(field, column, 0),
        visibilityAt(field, column, lastRow),
      ]),
    ].flat()

    for (const [underWall, further] of copiedPairs) {
      expect(at(underWall.x, underWall.y), `at ${underWall.x}, ${underWall.y}`).toBe(
        at(further.x, further.y),
      )
      expect(at(underWall.x, underWall.y), `at ${underWall.x}, ${underWall.y}`).toBeLessThan(
        OPEN_SKY,
      )
    }
    for (const point of outerPoints) {
      expect(at(point.x, point.y), `at ${point.x}, ${point.y}`).toBe(OPEN_SKY)
    }
    expect(outermost.every((value) => value === OPEN_SKY)).toBe(true)
  })
})
