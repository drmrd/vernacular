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

/** True when `point` lies on the segment from `a` to `b` (collinear and within the span). */
function pointOnEdge(point: Point, a: Point, b: Point): boolean {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
  if (cross !== 0) {
    return false
  }
  const withinX = point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
  const withinY = point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)
  return withinX && withinY
}

/**
 * Even-odd ray-casting test handling convex and non-convex polygons.
 *
 * Boundary rule: a point on an edge or vertex counts as inside. The crossing
 * loop uses a half-open edge convention (`a.y <= point.y < b.y` or its mirror),
 * so vertices are counted exactly once; the explicit on-edge check makes the
 * documented inclusive boundary deterministic rather than incidental.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (const [index, current] of polygon.entries()) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length] ?? current
    if (pointOnEdge(point, previous, current)) {
      return true
    }
    const crossesRay = current.y > point.y !== previous.y > point.y
    if (crossesRay) {
      const intersectX =
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
      if (point.x < intersectX) {
        inside = !inside
      }
    }
  }
  return inside
}
