import type { Point } from '../model/types'
import type { Vector3 } from './vector3'

/**
 * Maps a plan point at vertical `height` into Three.js world space
 * (right-handed, Y-up): plan x to world X, plan y to world Z, height to world Y.
 * This is the single source of the axis mapping; every three-dimensional
 * consumer goes through it (foundation spec section 2.1).
 *
 * The plan frame is rendered screen-style y-down: `worldToScreen` in
 * `editor/plan/viewport.ts` maps plan y with a positive coefficient, so larger
 * plan y is lower on screen. (This differs from the abstract pure-geometry
 * frame the `Point` type documents, where y increases upward.) Because the
 * destination world ground plane is y-up while the plan source is y-down, this
 * map is orientation-flipping relative to that ground plane.
 *
 * @param point Plan point, in millimeters (see the `Point` type).
 * @param height Elevation above the finished-floor datum, in millimeters
 *   (the same millimeter unit policy noted on `Vector3`).
 */
export function planToWorld(point: Point, height: number): Vector3 {
  return { x: point.x, y: height, z: point.y }
}
