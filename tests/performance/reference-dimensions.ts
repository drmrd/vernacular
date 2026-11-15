import { createDimension, type Dimension, type Point } from '../../core'
import { ROOM_COLUMNS, ROOM_DEPTH_MM, ROOM_ROWS, ROOM_WIDTH_MM } from './reference-layout'

/** The overall width and depth of the floor, then the widths of the first two rooms. */
export const DIMENSIONS_PER_FLOOR = 4

const OVERALL_OFFSET_MM = 1200
const ROOM_OFFSET_MM = 600
const MEASURED_ROOMS = 2

interface MeasuredSpan {
  start: Point
  end: Point
  offset: number
}

function measuredSpans(): MeasuredSpan[] {
  const floorWidth = ROOM_COLUMNS * ROOM_WIDTH_MM
  const floorDepth = ROOM_ROWS * ROOM_DEPTH_MM
  const overall: MeasuredSpan[] = [
    { start: { x: 0, y: 0 }, end: { x: floorWidth, y: 0 }, offset: OVERALL_OFFSET_MM },
    { start: { x: 0, y: 0 }, end: { x: 0, y: floorDepth }, offset: OVERALL_OFFSET_MM },
  ]
  const rooms = Array.from({ length: MEASURED_ROOMS }, (_, column) => ({
    start: { x: column * ROOM_WIDTH_MM, y: 0 },
    end: { x: (column + 1) * ROOM_WIDTH_MM, y: 0 },
    offset: ROOM_OFFSET_MM,
  }))
  return [...overall, ...rooms]
}

/** The same dimensions on every floor, with ids that name the floor. */
export function buildReferenceDimensions(floorId: string): Dimension[] {
  return measuredSpans().map((span, index) =>
    createDimension({ ...span, id: `${floorId}-dimension-${index + 1}` }),
  )
}
