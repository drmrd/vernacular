import type { Point } from '../model/types'
import type { Vector3 } from './vector3'

/**
 * Maps a plan point at vertical `height` into Three.js world space
 * (right-handed, Y-up): plan x to world X, plan north (+y) to world -Z, height to
 * world Y. This is the single source of the axis mapping; every three-dimensional
 * consumer goes through it (foundation spec section 2.1).
 *
 * The plan frame is y-up: `worldToScreen` in `editor/plan/viewport.ts` negates
 * plan y, so larger plan y is higher on screen (north), matching the `Point`
 * type's y-increases-upward convention. North must therefore map to world -Z, not
 * +Z. The negation keeps this map orientation-preserving (a proper rotation onto
 * the ground plane), so the three-dimensional scene is not a mirror image of the
 * plan, and it agrees with the camera-preset axis map (plan north is world -Z).
 *
 * @param point Plan point, in millimeters (see the `Point` type).
 * @param height Elevation above the finished-floor datum, in millimeters
 *   (the same millimeter unit policy noted on `Vector3`).
 */
export function planToWorld(point: Point, height: number): Vector3 {
  // `0 - point.y` rather than `-point.y`: a point on the floor line (plan y = 0)
  // then maps to a clean world z of +0 instead of the negative zero `-point.y`
  // yields, so floor-line world coordinates compare equal to a plain 0.
  return { x: point.x, y: height, z: 0 - point.y }
}
