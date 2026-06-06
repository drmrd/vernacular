import type { Point } from '../model/types'

/** Euclidean distance between two points, in millimeters. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
