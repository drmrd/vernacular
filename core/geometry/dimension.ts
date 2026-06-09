import type { Dimension, Point } from '../model/types'
import { distance } from './point'

/** Geometry for rendering a linear dimension at its offset distance. */
export interface DimensionGeometry {
  lineStart: Point
  lineEnd: Point
  extensionStart: readonly [Point, Point]
  extensionEnd: readonly [Point, Point]
}

/** Measured length of a dimension, in millimeters. */
export function dimensionLength(dimension: Pick<Dimension, 'start' | 'end'>): number {
  return distance(dimension.start, dimension.end)
}

function add(point: Point, vector: Point): Point {
  return { x: point.x + vector.x, y: point.y + vector.y }
}

function scale(vector: Point, factor: number): Point {
  return { x: vector.x * factor, y: vector.y * factor }
}

function copy(point: Point): Point {
  return { x: point.x, y: point.y }
}

function degenerateGeometry(start: Point, end: Point): DimensionGeometry {
  return {
    lineStart: copy(start),
    lineEnd: copy(end),
    extensionStart: [copy(start), copy(start)],
    extensionEnd: [copy(end), copy(end)],
  }
}

/** The dimension line shifted by `offset` along the left normal, with extension lines. */
export function dimensionGeometry(start: Point, end: Point, offset: number): DimensionGeometry {
  const length = distance(start, end)
  if (length === 0) {
    return degenerateGeometry(start, end)
  }

  const leftNormal: Point = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length }
  const shift = scale(leftNormal, offset)
  const lineStart = add(start, shift)
  const lineEnd = add(end, shift)

  return {
    lineStart,
    lineEnd,
    extensionStart: [copy(start), copy(lineStart)],
    extensionEnd: [copy(end), copy(lineEnd)],
  }
}
