import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'

/** Edge length of one daylight field cell, in plan millimetres. */
export const DAYLIGHT_FIELD_CELL_SIZE_MM = 100

/**
 * Cells of open sky that the grid keeps on every side of the rooms' snapped bounding box. It is
 * two because the inner margin cell can hold a room's value, copied under a wall on the edge of
 * the bounding box, and the outer one always holds open sky, so a lookup that clamps to the edge
 * of the grid reads open sky outside it.
 */
export const DAYLIGHT_FIELD_MARGIN_CELLS = 2

/** Values stored for each cell: bounce red, green, blue, then sky visibility. */
export const DAYLIGHT_FIELD_VALUES_PER_CELL = 4

/** Offset of the sky visibility within the values of a cell; offsets 0 to 2 hold the bounce color. */
export const SKY_VISIBILITY_CHANNEL = 3

/** Sky visibility of a cell that sees the whole open sky. */
export const OPEN_SKY_VISIBILITY = 1

/**
 * Net share of visible light that a window passes over its whole opening area (the span width
 * times the height from sill to head, so the frame and the sash are included), when its input
 * names none: one number for the glass, the frame, and any glazing bars. Single glazing passes
 * about 0.9, and the frame, the sash, and the glazing bars take about one tenth more, so 0.8
 * stands for it. It also fits double glazing in a thin frame. Dirt has no factor yet, and issue
 * #805 tracks dirt and glazing bars as their own factors.
 */
export const DEFAULT_WINDOW_NET_TRANSMITTANCE = 0.8

/** Net share of light that an open doorway passes: it has no glass and no frame, so all of it. */
export const OPEN_DOORWAY_NET_TRANSMITTANCE = 1

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
   * over its whole area, frame and sash included. Leave it out for the default:
   * DEFAULT_WINDOW_NET_TRANSMITTANCE for an opening to the sky, and
   * OPEN_DOORWAY_NET_TRANSMITTANCE for a doorway to a neighbor room. An open exterior door is
   * an opening to the sky with 1.
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
 * Creates the grid that covers the rooms of one floor, with a margin of DAYLIGHT_FIELD_MARGIN_CELLS
 * cells on every side. The origin is the lower corner of the rooms' bounding box, snapped down to
 * a multiple of the cell size, less the margin on each axis. The grid reaches the margin past the
 * far side of the snapped box, so each count is the cells that cover the box plus twice the
 * margin. A field of no rooms has no columns and no rows. Every cell starts with sky visibility 1
 * and no bounce; the light math fills it later.
 */
export function createDaylightField(rooms: readonly DaylightRoom[]): DaylightField {
  const cellSize = DAYLIGHT_FIELD_CELL_SIZE_MM
  const bounds = outlineBounds(rooms)
  if (bounds === null) {
    return { origin: { x: 0, y: 0 }, cellSize, columns: 0, rows: 0, data: new Float32Array(0) }
  }
  const margin = DAYLIGHT_FIELD_MARGIN_CELLS
  const snappedX = snapDown(bounds.minX, cellSize)
  const snappedY = snapDown(bounds.minY, cellSize)
  const origin = { x: snappedX - margin * cellSize, y: snappedY - margin * cellSize }
  const columns = Math.ceil((bounds.maxX - snappedX) / cellSize) + 2 * margin
  const rows = Math.ceil((bounds.maxY - snappedY) / cellSize) + 2 * margin
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
