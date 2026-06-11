import type { Bounds3, Vector3 } from './vector3'

export interface CameraPose {
  position: Vector3
  target: Vector3
  near: number
  far: number
}

const NEAR_FRACTION = 0.01
const FAR_MULTIPLE = 4
const DEFAULT_DIAGONAL = 10000

/** Fixed framing for an empty or degenerate scene: centered at the origin with
 *  a valid (non-NaN) near and far derived from a default diagonal. */
export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: { x: DEFAULT_DIAGONAL, y: DEFAULT_DIAGONAL, z: DEFAULT_DIAGONAL },
  target: { x: 0, y: 0, z: 0 },
  near: DEFAULT_DIAGONAL * NEAR_FRACTION,
  far: DEFAULT_DIAGONAL * FAR_MULTIPLE,
}

/**
 * Derives a camera pose framing the given world bounds. `near` is a small
 * fraction of the bounds diagonal and `far` a few multiples of it, so a
 * ten-meter house with hundred-millimeter walls does not z-fight. An empty
 * (null) or zero-size scene returns the fixed default pose (foundation spec 2.3).
 */
export function frameSceneCamera(bounds: Bounds3 | null): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
  const diagonal = Math.hypot(size.x, size.y, size.z)
  if (diagonal === 0) return DEFAULT_CAMERA_POSE
  const target: Vector3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
  return {
    target,
    position: {
      x: target.x + diagonal,
      y: target.y + diagonal,
      z: target.z + diagonal,
    },
    near: diagonal * NEAR_FRACTION,
    far: diagonal * FAR_MULTIPLE,
  }
}
