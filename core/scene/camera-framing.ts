import type { Bounds3, Vector3 } from './vector3'

export interface CameraPose {
  position: Vector3
  target: Vector3
  near: number
  far: number
  /** Camera up vector. Absent means the renderer's default world +Y, which keeps
   *  existing poses (and `frameSceneCamera`) upright. A consumer applying this pose
   *  to a live camera must set the camera's up from `pose.up ?? worldUpY`. */
  up?: Vector3
}

const NEAR_FRACTION = 0.01
const FAR_MULTIPLE = 4
const DEFAULT_DIAGONAL = 10000
/** Backs the camera off ~10% beyond the exact fit so the model has a thin border
 *  rather than touching the frustum edge. Kept small so the model still fills the
 *  pane (a larger margin would leave it tiny). */
const FRAME_MARGIN = 1.1

/** The viewport shape the camera must fit the model into. */
export interface CameraViewport {
  aspect: number
  fovRadians: number
  margin?: number
}

/** Distance from a sphere of `radius` so it fits the perspective frustum, limited
 *  by the narrower of the vertical and horizontal half-angles. */
function fitDistance(radius: number, viewport: CameraViewport): number {
  const halfVertical = viewport.fovRadians / 2
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * viewport.aspect)
  const limitingHalfAngle = Math.min(halfVertical, halfHorizontal)
  const margin = viewport.margin ?? FRAME_MARGIN
  return (radius / Math.sin(limitingHalfAngle)) * margin
}

/** Fixed framing for an empty or degenerate scene: centered at the origin with
 *  a valid (non-NaN) near and far derived from a default diagonal. */
export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: { x: DEFAULT_DIAGONAL, y: DEFAULT_DIAGONAL, z: DEFAULT_DIAGONAL },
  target: { x: 0, y: 0, z: 0 },
  near: DEFAULT_DIAGONAL * NEAR_FRACTION,
  far: DEFAULT_DIAGONAL * FAR_MULTIPLE,
}

/** The center point of `bounds` and the length of its diagonal. A zero diagonal
 *  marks an empty or degenerate scene; callers fall back to the default pose. */
export function centerAndDiagonal(bounds: Bounds3): { center: Vector3; diagonal: number } {
  const center: Vector3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  )
  return { center, diagonal }
}

/**
 * Derives a camera pose framing the given world bounds. `near` is a small
 * fraction of the bounds diagonal and `far` a few multiples of it, so a
 * ten-meter house with hundred-millimeter walls does not z-fight. An empty
 * (null) or zero-size scene returns the fixed default pose (foundation spec 2.3).
 */
export function frameSceneCamera(bounds: Bounds3 | null, viewport?: CameraViewport): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const { center: target, diagonal } = centerAndDiagonal(bounds)
  if (diagonal === 0) return DEFAULT_CAMERA_POSE
  const offset = cameraOffset(diagonal, viewport)
  return {
    target,
    position: {
      x: target.x + offset,
      y: target.y + offset,
      z: target.z + offset,
    },
    ...cameraDepthRange(diagonal),
  }
}

/** Distance to place the camera so a sphere spanning `diagonal` fits the frame.
 *  Without a viewport this keeps the loose `diagonal` placement; with one it fits
 *  the bounding sphere (radius `diagonal / 2`) to the frustum. */
export function cameraFitDistance(diagonal: number, viewport?: CameraViewport): number {
  if (viewport === undefined) return diagonal
  return fitDistance(diagonal / 2, viewport)
}

/** Near and far planes derived from a bounds diagonal: a small fraction in front
 *  and a few multiples behind, so thin walls in a large model do not z-fight. */
export function cameraDepthRange(diagonal: number): { near: number; far: number } {
  return { near: diagonal * NEAR_FRACTION, far: diagonal * FAR_MULTIPLE }
}

/** The per-axis distance from the target along the (1, 1, 1) view direction.
 *  Without a viewport this keeps the loose `diagonal` placement; with one it fits
 *  the bounding sphere to the frustum. Dividing by the length of the (1, 1, 1)
 *  direction spreads `distance` equally across the three axes. */
function cameraOffset(diagonal: number, viewport?: CameraViewport): number {
  if (viewport === undefined) return diagonal
  return cameraFitDistance(diagonal, viewport) / Math.hypot(1, 1, 1)
}
