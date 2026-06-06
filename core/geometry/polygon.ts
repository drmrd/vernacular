import type { Point } from '../model/types'

/**
 * Signed area of a polygon by the shoelace formula, in squared millimeters.
 * Positive for counter-clockwise winding, negative for clockwise.
 */
export function polygonArea(points: readonly Point[]): number {
  if (points.length === 0) return 0
  let sum = 0
  for (const [index, current] of points.entries()) {
    // points is non-empty (guarded above), so the wrap-around index is always
    // in bounds; the ?? only satisfies noUncheckedIndexedAccess and never runs.
    const next = points[(index + 1) % points.length] ?? current
    sum += current.x * next.y - next.x * current.y
  }
  return sum / 2
}
