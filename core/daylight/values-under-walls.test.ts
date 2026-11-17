// core/daylight/values-under-walls.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import {
  SKY_VISIBILITY_CHANNEL,
  daylightFieldCellIndex,
  sampleSkyVisibility,
} from './daylight-field'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

const SHELL_MIN_X = 60
const SHELL_MAX_X = 3940
const SHELL_MIN_Y = 60
const SHELL_MAX_Y = 2940
const CEILING_HEIGHT = 2600
const FLOOR_COLOR = { r: 0.5, g: 0.5, b: 0.5 }
const SILL = 900
const HEAD = 2100
const SHELL_REVEAL_DEPTH = 120
const FILTER_TOLERANCE = 1e-9
const DARK = 0
const NEIGHBOR_MIN_X = 4060
const NEIGHBOR_MAX_X = 7940
const SPLIT_ROOM_MAX_X = 3880
const SPLIT_NEIGHBOR_MIN_X = 4000

function rectangleOutline(minX: number, maxX: number): readonly Point[] {
  return [
    { x: minX, y: SHELL_MIN_Y },
    { x: maxX, y: SHELL_MIN_Y },
    { x: maxX, y: SHELL_MAX_Y },
    { x: minX, y: SHELL_MAX_Y },
  ]
}

function shellRoom(): DaylightRoom {
  return {
    outline: rectangleOutline(SHELL_MIN_X, SHELL_MAX_X),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: FLOOR_COLOR,
    apertures: [
      {
        span: [
          { x: SHELL_MAX_X, y: 1000 },
          { x: SHELL_MAX_X, y: 2000 },
        ],
        sill: SILL,
        head: HEAD,
        revealDepth: SHELL_REVEAL_DEPTH,
        opensTo: 'sky',
      },
    ],
  }
}

function litRoomWithWestWindow(maxX: number): DaylightRoom {
  return {
    outline: rectangleOutline(SHELL_MIN_X, maxX),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: FLOOR_COLOR,
    apertures: [
      {
        span: [
          { x: SHELL_MIN_X, y: 1000 },
          { x: SHELL_MIN_X, y: 2000 },
        ],
        sill: SILL,
        head: HEAD,
        revealDepth: 0,
        opensTo: 'sky',
      },
    ],
  }
}

function darkRoom(minX: number, maxX: number): DaylightRoom {
  return {
    outline: rectangleOutline(minX, maxX),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: FLOOR_COLOR,
    apertures: [],
  }
}

function fieldOf(rooms: readonly DaylightRoom[]): DaylightField {
  return createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
}

/** Linear filtering over the four nearest cell centers, with a tap off the grid clamped to the edge cell. */
function filteredVisibility(field: DaylightField, point: Point): number {
  const u = (point.x - field.origin.x) / field.cellSize - 0.5
  const v = (point.y - field.origin.y) / field.cellSize - 0.5
  const [column, row] = [Math.floor(u), Math.floor(v)]
  const [across, up] = [u - column, v - row]
  const at = (c: number, r: number): number => {
    const clampedColumn = Math.min(field.columns - 1, Math.max(0, c))
    const clampedRow = Math.min(field.rows - 1, Math.max(0, r))
    return (
      field.data[
        daylightFieldCellIndex(field, clampedColumn, clampedRow) + SKY_VISIBILITY_CHANNEL
      ] ?? NaN
    )
  }
  return (
    (1 - across) * (1 - up) * at(column, row) +
    across * (1 - up) * at(column + 1, row) +
    (1 - across) * up * at(column, row + 1) +
    across * up * at(column + 1, row + 1)
  )
}

function isInsideShell(point: Point): boolean {
  return (
    point.x > SHELL_MIN_X && point.x < SHELL_MAX_X && point.y > SHELL_MIN_Y && point.y < SHELL_MAX_Y
  )
}

function valuesOfTheShellCells(field: DaylightField): number[] {
  const values: number[] = []
  for (let row = 0; row < field.rows; row++) {
    for (let column = 0; column < field.columns; column++) {
      const center = {
        x: field.origin.x + (column + 0.5) * field.cellSize,
        y: field.origin.y + (row + 0.5) * field.cellSize,
      }
      if (isInsideShell(center)) {
        values.push(
          field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN,
        )
      }
    }
  }
  return values
}

/** Points inside the shell at each given distance from a wall, spread along that wall. */
function pointsWithin(
  insets: readonly number[],
  alongWest: readonly number[],
  alongSouth: readonly number[],
): Point[] {
  return insets.flatMap((inset) => [
    ...alongWest.flatMap((y) => [
      { x: SHELL_MIN_X + inset, y },
      { x: SHELL_MAX_X - inset, y },
    ]),
    ...alongSouth.flatMap((x) => [
      { x, y: SHELL_MIN_Y + inset },
      { x, y: SHELL_MAX_Y - inset },
    ]),
  ])
}

describe('a room daylight values reach one cell under its walls', () => {
  const shell = fieldOf([shellRoom()])

  it('reads below open sky at every point of the room within 50 mm of a wall', () => {
    const edgePoints = pointsWithin([1, 20, 49], [500, 1500, 2500], [1000, 2000, 3000])
    const cornerPoints = [
      { x: 80, y: 80 },
      { x: 3920, y: 80 },
      { x: 80, y: 2920 },
      { x: 3920, y: 2920 },
    ]

    for (const point of [...edgePoints, ...cornerPoints]) {
      expect(sampleSkyVisibility(shell, point), `at ${point.x}, ${point.y}`).toBeLessThan(1)
    }
  })

  it('reads at a point 20 mm inside a wall the same value as the point 100 mm further in', () => {
    const pairs: [Point, Point][] = [
      [
        { x: 80, y: 1500 },
        { x: 180, y: 1500 },
      ],
      [
        { x: 3920, y: 1500 },
        { x: 3820, y: 1500 },
      ],
      [
        { x: 2000, y: 80 },
        { x: 2000, y: 180 },
      ],
      [
        { x: 2000, y: 2920 },
        { x: 2000, y: 2820 },
      ],
      [
        { x: 80, y: 80 },
        { x: 180, y: 180 },
      ],
      [
        { x: 3920, y: 80 },
        { x: 3820, y: 180 },
      ],
      [
        { x: 80, y: 2920 },
        { x: 180, y: 2820 },
      ],
      [
        { x: 3920, y: 2920 },
        { x: 3820, y: 2820 },
      ],
    ]

    for (const [underWall, further] of pairs) {
      expect(sampleSkyVisibility(shell, underWall), `at ${underWall.x}, ${underWall.y}`).toBe(
        sampleSkyVisibility(shell, further),
      )
    }
  })

  it('keeps a filtered lookup within one cell of a wall between the extremes of the rooms own cells', () => {
    const own = valuesOfTheShellCells(shell)
    const smallest = Math.min(...own)
    const largest = Math.max(...own)
    const points = pointsWithin(
      [5, 50, 95],
      [65, 500, 1500, 2500, 2935],
      [65, 1000, 2000, 3000, 3935],
    )

    for (const point of points) {
      const filtered = filteredVisibility(shell, point)
      expect(filtered, `at ${point.x}, ${point.y}`).toBeGreaterThanOrEqual(
        smallest - FILTER_TOLERANCE,
      )
      expect(filtered, `at ${point.x}, ${point.y}`).toBeLessThanOrEqual(largest + FILTER_TOLERANCE)
    }
  })

  it('gives each side of a 120 mm wall the value of the room on that side', () => {
    const field = fieldOf([
      litRoomWithWestWindow(SHELL_MAX_X),
      darkRoom(NEIGHBOR_MIN_X, NEIGHBOR_MAX_X),
    ])
    const at = (x: number): number => sampleSkyVisibility(field, { x, y: 1500 })

    expect(at(3950)).toBe(at(3850))
    expect(at(3850)).toBeGreaterThan(DARK)
    expect(at(4050)).toBe(at(4150))
    expect(at(4150)).toBe(DARK)
  })

  it('gives a cell between two room cells the value of the room whose outline is nearer', () => {
    const field = fieldOf([
      litRoomWithWestWindow(SPLIT_ROOM_MAX_X),
      darkRoom(SPLIT_NEIGHBOR_MIN_X, NEIGHBOR_MAX_X),
    ])
    const at = (x: number): number => sampleSkyVisibility(field, { x, y: 1500 })

    expect(at(3950)).toBe(at(4050))
    expect(at(4050)).toBe(DARK)
    expect(at(3850)).toBeGreaterThan(DARK)
  })
})
