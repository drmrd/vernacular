import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'

/** Edge length of one daylight field cell, in plan millimetres. */
export const DAYLIGHT_FIELD_CELL_SIZE_MM = 100

/** Values stored for each cell: bounce red, green, blue, then sky visibility. */
export const DAYLIGHT_FIELD_VALUES_PER_CELL = 4

/** Offset of the sky visibility within the values of a cell; offsets 0 to 2 hold the bounce color. */
export const SKY_VISIBILITY_CHANNEL = 3

/** Sky visibility of a cell that sees the whole open sky. */
export const OPEN_SKY_VISIBILITY = 1

/** An opening in a room's outline that lets light in from the sky or from a neighbor room. */
export interface DaylightAperture {
  /** The two end points of the opening, in plan millimetres, on the room outline. */
  span: readonly [Point, Point]
  /** Plan millimetres above the room's floor. */
  sill: number
  /** Plan millimetres above the room's floor. */
  head: number
  /** Plan millimetres. */
  revealDepth: number
  /** An interior doorway names its neighbor by index. */
  opensTo: 'sky' | { room: number }
  /**
   * Net transmittance of the opening, from 0 to 1: the share of visible light that it passes
   * over its whole area, frame and sash included. Leave it out for 1.
   */
  netTransmittance?: number
}

/** One room as the daylight field sees it. */
export interface DaylightRoom {
  outline: readonly Point[]
  /** Plan millimetres above the room's floor. */
  ceilingHeight: number
  floorColor: LinearRgb
  apertures: readonly DaylightAperture[]
  /** A room open to the sky holds full visibility in every cell. */
  openToSky?: boolean
}

/** A grid in plan coordinates; row 0 starts at `origin.y`, and the data is row-major. */
export interface DaylightField {
  /** Plan millimetres. */
  origin: Point
  /** Plan millimetres. */
  cellSize: number
  columns: number
  rows: number
  /** Four values per cell: bounce red, green, blue, sky visibility. */
  data: Float32Array
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function outlineBounds(rooms: readonly DaylightRoom[]): Bounds | null {
  const points = rooms.flatMap((room) => room.outline)
  if (points.length === 0) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

function snapDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

/**
 * Creates the grid that covers the rooms of one floor. The origin is the lower corner of the
 * rooms' bounding box, snapped down to a multiple of the cell size. Every cell starts with sky
 * visibility 1 and no bounce; the light math fills it later.
 */
export function createDaylightField(rooms: readonly DaylightRoom[]): DaylightField {
  const cellSize = DAYLIGHT_FIELD_CELL_SIZE_MM
  const bounds = outlineBounds(rooms)
  if (bounds === null) {
    return { origin: { x: 0, y: 0 }, cellSize, columns: 0, rows: 0, data: new Float32Array(0) }
  }
  const origin = { x: snapDown(bounds.minX, cellSize), y: snapDown(bounds.minY, cellSize) }
  const columns = Math.ceil((bounds.maxX - origin.x) / cellSize)
  const rows = Math.ceil((bounds.maxY - origin.y) / cellSize)
  const data = new Float32Array(DAYLIGHT_FIELD_VALUES_PER_CELL * columns * rows)
  for (let cell = 0; cell < columns * rows; cell++) {
    data[cell * DAYLIGHT_FIELD_VALUES_PER_CELL + SKY_VISIBILITY_CHANNEL] = OPEN_SKY_VISIBILITY
  }
  return { origin, cellSize, columns, rows, data }
}

/** Index in `field.data` of the first value of the cell at `column` and `row`. */
export function daylightFieldCellIndex(field: DaylightField, column: number, row: number): number {
  return DAYLIGHT_FIELD_VALUES_PER_CELL * (row * field.columns + column)
}

/**
 * Sky visibility of the cell that contains `point`, or 1 for a point outside the grid. A cell is
 * the half-open interval from its lower edge to its upper edge, so a point on the far edge of the
 * grid, a point outside the grid, and a point that is not a finite number all return the open-sky
 * value.
 */
export function sampleSkyVisibility(field: DaylightField, point: Point): number {
  const column = Math.floor((point.x - field.origin.x) / field.cellSize)
  const row = Math.floor((point.y - field.origin.y) / field.cellSize)
  if (column < 0 || column >= field.columns || row < 0 || row >= field.rows) {
    return OPEN_SKY_VISIBILITY
  }
  const visibility = field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL]
  return visibility ?? OPEN_SKY_VISIBILITY
}
