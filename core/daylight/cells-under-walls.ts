import type { Point } from '../model/types'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { daylightFieldCellIndex, SKY_VISIBILITY_CHANNEL } from './daylight-field'

/** Marks a cell whose center lies in no room. */
export const NO_ROOM = -1

/** A cell center sits half a cell past its lower edge. */
const CELL_CENTER_OFFSET = 0.5

/**
 * The eight neighbors of a cell as column and row offsets, in the tie order: left, right, below,
 * above (below is the row with the smaller y), then lower left, lower right, upper left, upper
 * right. The four edge neighbors come before the diagonals because they are nearer.
 */
const NEIGHBOR_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

/** A cell under a wall and the room cell it copies: the index of each sky visibility in `data`. */
export interface CellCopy {
  targetIndex: number
  sourceIndex: number
}

/** A cell of the grid, by its column and row. */
interface GridCell {
  column: number
  row: number
}

interface NeighborCell extends GridCell {
  room: number
}

/** Center of the cell at `column` and `row`, in plan millimetres. */
export function cellCenter(grid: DaylightField, column: number, row: number): Point {
  return {
    x: grid.origin.x + (column + CELL_CENTER_OFFSET) * grid.cellSize,
    y: grid.origin.y + (row + CELL_CENTER_OFFSET) * grid.cellSize,
  }
}

function visibilityIndex(grid: DaylightField, column: number, row: number): number {
  return daylightFieldCellIndex(grid, column, row) + SKY_VISIBILITY_CHANNEL
}

function roomAt(grid: DaylightField, roomOfCell: Int32Array, cell: GridCell): number {
  const { column, row } = cell
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return NO_ROOM
  return roomOfCell[row * grid.columns + column] ?? NO_ROOM
}

function segmentDistance(point: Point, start: Point, end: Point): number {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  const projection =
    lengthSquared === 0
      ? 0
      : ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  const along = Math.min(1, Math.max(0, projection))
  return Math.hypot(point.x - (start.x + along * deltaX), point.y - (start.y + along * deltaY))
}

/** Shortest distance from `point` to an edge of the closed outline. */
function outlineDistance(point: Point, outline: readonly Point[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const [index, start] of outline.entries()) {
    const end = outline[(index + 1) % outline.length]
    if (end !== undefined) nearest = Math.min(nearest, segmentDistance(point, start, end))
  }
  return nearest
}

function roomNeighbors(
  grid: DaylightField,
  roomOfCell: Int32Array,
  cell: GridCell,
): NeighborCell[] {
  const neighbors: NeighborCell[] = []
  for (const [columnOffset, rowOffset] of NEIGHBOR_OFFSETS) {
    const column = cell.column + columnOffset
    const row = cell.row + rowOffset
    const room = roomAt(grid, roomOfCell, { column, row })
    if (room !== NO_ROOM) neighbors.push({ room, column, row })
  }
  return neighbors
}

/** The room whose outline lies nearest `center`; on an equal distance, the first in the input. */
function nearestRoom(
  neighbors: readonly NeighborCell[],
  rooms: readonly DaylightRoom[],
  center: Point,
): number {
  const candidates = [...new Set(neighbors.map((neighbor) => neighbor.room))].sort((a, b) => a - b)
  let nearest = NO_ROOM
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const room of candidates) {
    const distance = outlineDistance(center, rooms[room]?.outline ?? [])
    if (distance < nearestDistance) {
      nearest = room
      nearestDistance = distance
    }
  }
  return nearest
}

/**
 * Finds the cells under the walls and the source of each, so that a room's values reach one cell
 * past its outline. A cell whose center lies in no room, with a room cell (a room open to the sky
 * counts) among its eight neighbors, copies the sky visibility of one such neighbor. Only cells
 * whose center lies in a room are sources, never another copied cell. The room is the one whose
 * outline lies nearest the cell's center, and on an equal distance the first in the input. Its
 * source cell is the first of its neighbors in the order of `NEIGHBOR_OFFSETS`. `roomOfCell` holds
 * the room of each cell in row-major order, or `NO_ROOM`.
 */
export function findCellsUnderWalls(
  grid: DaylightField,
  rooms: readonly DaylightRoom[],
  roomOfCell: Int32Array,
): CellCopy[] {
  const copies: CellCopy[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const cell = { column, row }
      if (roomAt(grid, roomOfCell, cell) !== NO_ROOM) continue
      const neighbors = roomNeighbors(grid, roomOfCell, cell)
      const room = nearestRoom(neighbors, rooms, cellCenter(grid, column, row))
      const source = neighbors.find((neighbor) => neighbor.room === room)
      if (source === undefined) continue
      copies.push({
        targetIndex: visibilityIndex(grid, column, row),
        sourceIndex: visibilityIndex(grid, source.column, source.row),
      })
    }
  }
  return copies
}
