import {
  DEFAULT_CAMERA_POSE,
  cameraDepthRange,
  cameraFitDistance,
  centerAndDiagonal,
  type CameraPose,
  type CameraViewport,
} from './camera-framing'
import type { Bounds3, Vector3 } from './vector3'

/** A named canonical viewpoint onto the model. */
export type CameraPreset = 'top' | 'north' | 'south' | 'east' | 'west'

/** Per-preset unit center-to-camera direction and the camera up vector. The plan
 *  maps east to world +X, south to world +Z, and height to world Y, so the top
 *  view looks straight down with plan-north (world -Z) toward the top of the pane. */
const PRESET_VIEW: Record<CameraPreset, { dir: Vector3; up: Vector3 }> = {
  top: { dir: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: -1 } },
  north: { dir: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
  south: { dir: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  east: { dir: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
  west: { dir: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
}

/**
 * Derives the camera pose for a named preset framing the given world bounds. The
 * camera sits at the viewport-fit distance along the preset direction from the
 * bounds center, looks at the center, and uses the preset up vector. An empty
 * (null) or zero-size scene returns the fixed default pose.
 */
export function cameraPresetPose(
  preset: CameraPreset,
  bounds: Bounds3 | null,
  viewport?: CameraViewport,
): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const { center, diagonal } = centerAndDiagonal(bounds)
  if (diagonal === 0) return DEFAULT_CAMERA_POSE
  const { dir, up } = PRESET_VIEW[preset]
  const distance = cameraFitDistance(diagonal, viewport)
  return {
    position: {
      x: center.x + dir.x * distance,
      y: center.y + dir.y * distance,
      z: center.z + dir.z * distance,
    },
    target: center,
    up,
    ...cameraDepthRange(diagonal),
  }
}
