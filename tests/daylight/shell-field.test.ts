import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKY_VISIBILITY_CHANNEL, daylightFieldCellIndex } from '../../core/daylight/daylight-field'
import type { DaylightField, DaylightRoom } from '../../core/daylight/daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from '../../core/daylight/sky-visibility'

// Numbers of the harness shell, from `bridge/react/harness-fixtures.ts`: the walls enclose
// 4000 by 3000 mm on their centerlines and are 120 mm thick, so the clear interior is inset
// by half that thickness (60 mm) on every side, leaving 3880 by 2880 mm.
const SHELL_WIDTH = 4000
const SHELL_DEPTH = 3000
const WALL_THICKNESS = 120
const INSET = WALL_THICKNESS / 2
const INTERIOR_MIN_X = INSET
const INTERIOR_MAX_X = SHELL_WIDTH - INSET
const INTERIOR_MIN_Y = INSET
const INTERIOR_MAX_Y = SHELL_DEPTH - INSET
// The shell room's ceilingHeight in the fixture.
const CEILING_HEIGHT = 2600
// The east window of the fixture: 1000 mm wide, centered on the east wall (y = 1500),
// sill 900 mm, height 1200 mm, so the head is 2100 mm. Its span sits on the east interior
// face; the reveal depth of 120 mm is the wall thickness.
const WINDOW_WIDTH = 1000
const WINDOW_SILL = 900
const WINDOW_HEIGHT = 1200
const WINDOW_HEAD = WINDOW_SILL + WINDOW_HEIGHT
const WINDOW_CENTER_Y = SHELL_DEPTH / 2
const REVEAL_DEPTH = WALL_THICKNESS
// The unpainted floor color the other daylight tests use: linear mid gray.
const FLOOR_COLOR = { r: 0.5, g: 0.5, b: 0.5 }
const MONOTONIC_TOLERANCE = 1e-9
const PLOT_VARIABLE = 'PLOT_DAYLIGHT_FIELD'
const PLOT_FILE_NAME = 'daylight-shell-field.svg'
const WHITE_LEVEL = 255

const SHELL_ROOM: DaylightRoom = {
  outline: [
    { x: INTERIOR_MIN_X, y: INTERIOR_MIN_Y },
    { x: INTERIOR_MAX_X, y: INTERIOR_MIN_Y },
    { x: INTERIOR_MAX_X, y: INTERIOR_MAX_Y },
    { x: INTERIOR_MIN_X, y: INTERIOR_MAX_Y },
  ],
  ceilingHeight: CEILING_HEIGHT,
  floorColor: FLOOR_COLOR,
  apertures: [
    {
      span: [
        { x: INTERIOR_MAX_X, y: WINDOW_CENTER_Y - WINDOW_WIDTH / 2 },
        { x: INTERIOR_MAX_X, y: WINDOW_CENTER_Y + WINDOW_WIDTH / 2 },
      ],
      sill: WINDOW_SILL,
      head: WINDOW_HEAD,
      revealDepth: REVEAL_DEPTH,
      opensTo: 'sky',
    },
  ],
}

interface RoomCell {
  column: number
  row: number
  center: { x: number; y: number }
  visibility: number
}

function visibilityAt(field: DaylightField, column: number, row: number): number {
  return field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN
}

function isInsideShell(point: { x: number; y: number }): boolean {
  return (
    point.x > INTERIOR_MIN_X &&
    point.x < INTERIOR_MAX_X &&
    point.y > INTERIOR_MIN_Y &&
    point.y < INTERIOR_MAX_Y
  )
}

function cellsOfTheRoom(field: DaylightField): RoomCell[] {
  const cells: RoomCell[] = []
  for (let row = 0; row < field.rows; row++) {
    for (let column = 0; column < field.columns; column++) {
      const center = {
        x: field.origin.x + (column + 0.5) * field.cellSize,
        y: field.origin.y + (row + 0.5) * field.cellSize,
      }
      if (isInsideShell(center)) {
        cells.push({ column, row, center, visibility: visibilityAt(field, column, row) })
      }
    }
  }
  return cells
}

function distanceToWindowMidpoint(cell: RoomCell): number {
  return Math.hypot(cell.center.x - INTERIOR_MAX_X, cell.center.y - WINDOW_CENTER_Y)
}

function nearestToTheWindow(cells: readonly RoomCell[]): RoomCell {
  const nearest = cells.reduce((best, cell) =>
    distanceToWindowMidpoint(cell) < distanceToWindowMidpoint(best) ? cell : best,
  )
  return nearest
}

function describeStatistics(cells: readonly RoomCell[]) {
  const values = cells.map((cell) => cell.visibility)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return { mean, minimum: Math.min(...values), maximum: Math.max(...values) }
}

function heatMapSvg(field: DaylightField, cells: readonly RoomCell[]): string {
  const { mean, minimum, maximum } = describeStatistics(cells)
  const rectangles = cells.map((cell) => {
    const level = Math.round((cell.visibility / maximum) * WHITE_LEVEL)
    const x = cell.column * field.cellSize
    const y = cell.row * field.cellSize
    return `<rect x="${x}" y="${y}" width="${field.cellSize}" height="${field.cellSize}" fill="rgb(${level},${level},${level})"/>`
  })
  const width = field.columns * field.cellSize
  const height = field.rows * field.cellSize
  const caption = `maximum ${maximum.toFixed(4)}, mean ${mean.toFixed(4)}, minimum ${minimum.toFixed(4)}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width / 2}" height="${height / 2}">`,
    `<title>${caption}</title>`,
    `<rect width="${width}" height="${height}" fill="#808080"/>`,
    ...rectangles,
    `<text x="${field.cellSize}" y="${height - field.cellSize / 2}" font-size="80" fill="#ff0000">${caption}</text>`,
    '</svg>',
  ].join('\n')
}

function plotWhenAsked(field: DaylightField, cells: readonly RoomCell[]): void {
  if (process.env[PLOT_VARIABLE] !== '1') return
  const folder = join(tmpdir(), 'vernacular-daylight')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, PLOT_FILE_NAME)
  writeFileSync(path, heatMapSvg(field, cells))
  const { mean, minimum, maximum } = describeStatistics(cells)
  // eslint-disable-next-line no-console -- the plot path and the field statistics are the output of the opt-in plot run
  console.log(`daylight field plot: ${path} (mean ${mean}, minimum ${minimum}, maximum ${maximum})`)
}

describe('the daylight field of the harness shell lit by its east window', () => {
  const field = createDaylightFieldSolver([SHELL_ROOM]).field(UNIFORM_SKY)
  const cells = cellsOfTheRoom(field)
  plotWhenAsked(field, cells)

  it('has a mean visibility over the room strictly between dark and the open sky', () => {
    const { mean, minimum, maximum } = describeStatistics(cells)
    const message = `mean ${mean}, minimum ${minimum}, maximum ${maximum}`

    expect(mean, message).toBeGreaterThan(0)
    expect(mean, message).toBeLessThan(1)
  })

  it('is brightest in the cell nearest the window', () => {
    const nearest = nearestToTheWindow(cells)
    const { maximum } = describeStatistics(cells)

    expect(nearest.visibility).toBeGreaterThanOrEqual(maximum - MONOTONIC_TOLERANCE)
  })

  it('holds a finite value in every channel of every cell', () => {
    expect(Array.from(field.data).every(Number.isFinite)).toBe(true)
  })

  it('falls from the window toward the far wall along the row through the window midpoint', () => {
    const nearest = nearestToTheWindow(cells)
    const row = cells
      .filter((cell) => cell.row === nearest.row)
      .sort((first, second) => second.column - first.column)

    expect(row[0]).toBe(nearest)
    row.slice(1).forEach((cell, index) => {
      const previous = row[index]
      expect(cell.visibility).toBeLessThanOrEqual(
        (previous?.visibility ?? NaN) + MONOTONIC_TOLERANCE,
      )
    })
  })
})
