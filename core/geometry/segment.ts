import type { Point } from '../model/types'

/** Denominator magnitudes below this are treated as parallel or collinear. */
const PARALLEL_EPSILON = 1e-9

/** Squared lengths below this mark an effectively zero-length (degenerate) segment. */
const DEGENERATE_SEGMENT_EPSILON = 1e-9

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
 * Intersection point of the two infinite lines through `pointA` with direction
 * `dirA` and through `pointB` with direction `dirB`, or null when the directions
 * are parallel (so the lines are parallel or collinear). Unlike
 * {@link segmentIntersection} this does not clamp to a segment: the miter builder
 * needs the crossing of two offset face lines, which can lie beyond either wall's
 * span.
 */
// eslint-disable-next-line max-params -- two point/direction pairs is the conventional line-line form
export function lineIntersection(
  pointA: Point,
  dirA: Point,
  pointB: Point,
  dirB: Point,
): Point | null {
  const denominator = dirA.x * dirB.y - dirA.y * dirB.x
  if (Math.abs(denominator) < PARALLEL_EPSILON) return null

  const t = ((pointB.x - pointA.x) * dirB.y - (pointB.y - pointA.y) * dirB.x) / denominator
  return { x: pointA.x + t * dirA.x, y: pointA.y + t * dirA.y }
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
  if (lengthSquared < DEGENERATE_SEGMENT_EPSILON) {
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
