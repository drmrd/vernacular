import type { Point } from '../model/types'

/** Denominator magnitudes below this are treated as parallel or collinear. */
const PARALLEL_EPSILON = 1e-9

/**
 * Intersection point of the two closed segments [a1, a2] and [b1, b2], or null
 * when they are parallel, collinear, or disjoint. Uses the standard parametric
 * line-segment intersection: the cross-product denominator gives the parameters
 * t and u, and a point is returned only when both lie within [0, 1].
 */
// eslint-disable-next-line max-params -- four-point parametric form is the conventional mathematical signature for segment-segment intersection
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y

  const denominator = dax * dby - day * dbx
  if (Math.abs(denominator) < PARALLEL_EPSILON) return null

  // Vector from the start of segment a to the start of segment b.
  const dabx = b1.x - a1.x
  const daby = b1.y - a1.y

  const t = (dabx * dby - daby * dbx) / denominator
  const u = (dabx * day - daby * dax) / denominator

  if (t < 0 || t > 1 || u < 0 || u > 1) return null

  return { x: a1.x + t * dax, y: a1.y + t * day }
}

/**
 * True when p lies on the closed segment [a, b] within tolerance world units,
 * including the interior. Projects p onto the segment, clamps the projection
 * parameter to [0, 1], and tests the distance from p to that closest point. A
 * zero-length segment (a == b) is compared against the single point directly.
 */
// eslint-disable-next-line max-params -- point plus two segment endpoints plus tolerance is the conventional signature for a point-on-segment test
export function pointOnSegment(p: Point, a: Point, b: Point, tolerance: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y

  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < PARALLEL_EPSILON) {
    const offx = p.x - a.x
    const offy = p.y - a.y
    return Math.hypot(offx, offy) <= tolerance
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closestX = a.x + t * dx
  const closestY = a.y + t * dy

  return Math.hypot(p.x - closestX, p.y - closestY) <= tolerance
}
