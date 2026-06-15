import {
  DEFAULT_CAMERA_POSE,
  cameraDepthRange,
  cameraFitDistance,
  centerAndDiagonal,
  type CameraPose,
  type CameraViewport,
} from './camera-framing'
import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Bounds3, Vector3 } from './vector3'

/** A named canonical viewpoint onto the model. */
export type CameraPreset = 'top' | 'north' | 'south' | 'east' | 'west'

/** The world up vector for an upright camera (Y-up world). */
const WORLD_UP_Y: Vector3 = { x: 0, y: 1, z: 0 }

/** Per-preset unit center-to-camera direction and the camera up vector. The plan
 *  maps east to world +X, south to world +Z, and height to world Y, so the top
 *  view looks straight down with plan-north (world -Z) toward the top of the pane. */
const PRESET_VIEW: Record<CameraPreset, { dir: Vector3; up: Vector3 }> = {
  top: { dir: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: -1 } },
  north: { dir: { x: 0, y: 0, z: -1 }, up: WORLD_UP_Y },
  south: { dir: { x: 0, y: 0, z: 1 }, up: WORLD_UP_Y },
  east: { dir: { x: 1, y: 0, z: 0 }, up: WORLD_UP_Y },
  west: { dir: { x: -1, y: 0, z: 0 }, up: WORLD_UP_Y },
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

/** The unit world-horizontal direction of `opening`'s wall normal, flipped to
 *  point from `position` toward the interior `center` (a zero-length normal is
 *  treated as unit). */
function inwardNormal(
  opening: OpeningSceneNode,
  position: Vector3,
  center: Vector3,
): { x: number; z: number } {
  const length = Math.hypot(opening.normal.x, opening.normal.y) || 1
  const nx = opening.normal.x / length
  const nz = opening.normal.y / length
  const towardCenter = nx * (center.x - position.x) + nz * (center.z - position.z)
  const sign = towardCenter < 0 ? -1 : 1
  return { x: nx * sign, z: nz * sign }
}

/**
 * Derives the camera pose for standing in `opening` and looking into the model.
 * The camera sits at the opening center raised to its vertical middle and looks
 * horizontally along the wall normal toward the bounds interior. An empty (null)
 * scene returns the fixed default pose.
 */
export function doorwayPose(opening: OpeningSceneNode, bounds: Bounds3 | null): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const { center, diagonal } = centerAndDiagonal(bounds)
  const eye = opening.sillHeight + opening.height / 2
  const position = planToWorld(opening.center, eye)
  const inward = inwardNormal(opening, position, center)
  return {
    position,
    target: { x: position.x + inward.x, y: position.y, z: position.z + inward.z },
    up: WORLD_UP_Y,
    ...cameraDepthRange(diagonal),
  }
}
