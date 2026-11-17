// core/daylight/daylight-field.test.ts
import { describe, expect, it } from 'vitest'
import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'
import {
  SKY_VISIBILITY_CHANNEL,
  createDaylightField,
  daylightFieldCellIndex,
  sampleSkyVisibility,
} from './daylight-field'
import type { DaylightRoom } from './daylight-field'

const CELL_SIZE = 100
const CHANNELS_PER_CELL = 4
const COLUMNS = 124
const ROWS = 94
const FLOOR_COLOR: LinearRgb = { r: 0.5, g: 0.5, b: 0.5 }
const CEILING_HEIGHT = 2700
const MARKED_VISIBILITY = 0.25

function rectangleRoom(low: Point, high: Point): DaylightRoom {
  return {
    outline: [low, { x: high.x, y: low.y }, high, { x: low.x, y: high.y }],
    ceilingHeight: CEILING_HEIGHT,
    floorColor: FLOOR_COLOR,
    apertures: [],
  }
}

// Two rooms side by side that together cover 12 m by 9 m from the plan origin.
const TWELVE_BY_NINE: readonly DaylightRoom[] = [
  rectangleRoom({ x: 0, y: 0 }, { x: 7000, y: 9000 }),
  rectangleRoom({ x: 7000, y: 0 }, { x: 12000, y: 9000 }),
]

describe('createDaylightField', () => {
  it('covers rooms of 12 m by 9 m with 124 columns and 94 rows of 100 mm cells, two of them a margin on each side', () => {
    const field = createDaylightField(TWELVE_BY_NINE)
    expect([field.columns, field.rows, field.cellSize]).toEqual([COLUMNS, ROWS, CELL_SIZE])
  })

  it('places the origin at the lowest corner of the rooms, snapped down to a multiple of 100, less a margin of two cells', () => {
    const offGrid = [rectangleRoom({ x: -1250, y: 340 }, { x: 10750, y: 9340 })]
    expect(createDaylightField(offGrid).origin).toEqual({ x: -1500, y: 100 })
  })

  it('holds four values for each cell', () => {
    const field = createDaylightField(TWELVE_BY_NINE)
    expect(field.data.length).toBe(CHANNELS_PER_CELL * COLUMNS * ROWS)
  })

  it('starts every cell with sky visibility 1 and no bounce', () => {
    const { data } = createDaylightField(TWELVE_BY_NINE)
    const cells = Array.from({ length: data.length / CHANNELS_PER_CELL }, (_, cell) =>
      Array.from(data.slice(cell * CHANNELS_PER_CELL, (cell + 1) * CHANNELS_PER_CELL)),
    )
    expect(cells.every((cell) => cell.join(',') === '0,0,0,1')).toBe(true)
  })

  it('gives a field of 0 columns and 0 rows when there are no rooms', () => {
    const field = createDaylightField([])
    expect([field.columns, field.rows, field.data.length]).toEqual([0, 0, 0])
  })
})

describe('daylightFieldCellIndex', () => {
  it('is four times the row-major cell number, with row 0 first', () => {
    const field = createDaylightField(TWELVE_BY_NINE)
    expect([
      daylightFieldCellIndex(field, 0, 0),
      daylightFieldCellIndex(field, 1, 0),
      daylightFieldCellIndex(field, 3, 2),
      daylightFieldCellIndex(field, COLUMNS - 1, ROWS - 1),
    ]).toEqual([0, 4, 1004, 46620])
  })
})

describe('sampleSkyVisibility', () => {
  it('reads the cell that contains the point', () => {
    const field = createDaylightField(TWELVE_BY_NINE)
    field.data[daylightFieldCellIndex(field, 3, 2) + SKY_VISIBILITY_CHANNEL] = MARKED_VISIBILITY
    const point = { x: field.origin.x + 350, y: field.origin.y + 250 }
    expect([sampleSkyVisibility(field, point), sampleSkyVisibility(field, field.origin)]).toEqual([
      MARKED_VISIBILITY,
      1,
    ])
  })

  it('returns 1 for a point outside the grid', () => {
    const field = createDaylightField(TWELVE_BY_NINE)
    const lastCell = daylightFieldCellIndex(field, COLUMNS - 1, ROWS - 1)
    field.data[lastCell + SKY_VISIBILITY_CHANNEL] = MARKED_VISIBILITY
    const { x, y } = field.origin
    const outside = [
      { x: x - 1, y: y + 450 },
      { x: x + COLUMNS * CELL_SIZE, y: y + (ROWS - 1) * CELL_SIZE + 50 },
      { x: x + 450, y: y - 1 },
      { x: x + (COLUMNS - 1) * CELL_SIZE + 50, y: y + ROWS * CELL_SIZE },
    ]
    expect(outside.map((point) => sampleSkyVisibility(field, point))).toEqual([1, 1, 1, 1])
  })
})
