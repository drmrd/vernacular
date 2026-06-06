import type { Point } from '../model/types'

/** Denominator magnitudes below this are treated as parallel or collinear. */
const PARALLEL_EPSILON = 1e-9

/**
 * Intersection point of the two closed segments [a1, a2] and [b1, b2], or null
 * when they are parallel, collinear, or disjoint. Uses the standard parametric
 * line-segment intersection: the cross-product denominator gives the parameters
 * t and u, and a point is returned only when both lie within [0, 1].
 */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y

  const denominator = dax * dby - day * dbx
  if (Math.abs(denominator) < PARALLEL_EPSILON) return null

  const acx = b1.x - a1.x
  const acy = b1.y - a1.y

  const t = (acx * dby - acy * dbx) / denominator
  const u = (acx * day - acy * dax) / denominator

  if (t < 0 || t > 1 || u < 0 || u > 1) return null

  return { x: a1.x + t * dax, y: a1.y + t * day }
}
