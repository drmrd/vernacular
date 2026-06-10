import type { Point } from '../model/types'
import type { Vector3 } from './vector3'

/**
 * Maps a plan point (screen-style y-down) at vertical height `height` into
 * Three.js world space (right-handed, Y-up): plan x to world X, plan y to world
 * Z, height to world Y. This is the single source of the axis mapping; every
 * three-dimensional consumer goes through it (foundation spec section 2.1).
 */
export function planToWorld(point: Point, height: number): Vector3 {
  return { x: point.x, y: height, z: point.y }
}
