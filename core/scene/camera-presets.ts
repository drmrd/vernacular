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

/** A unit world-horizontal direction flipped to point from `position` toward the
 *  interior `center`. */
function towardInterior(
  unit: { x: number; z: number },
  position: Vector3,
  center: Vector3,
): { x: number; z: number } {
  const towardCenter = unit.x * (center.x - position.x) + unit.z * (center.z - position.z)
  const sign = towardCenter < 0 ? -1 : 1
  return { x: unit.x * sign, z: unit.z * sign }
}

/** A world-horizontal direction multiplied by `sign`. */
function scaled(unit: { x: number; z: number }, sign: number): { x: number; z: number } {
  return { x: unit.x * sign, z: unit.z * sign }
}

/** The sign of the wall's left-hand normal that points into the room, by room side. */
const ROOM_SIDE_SIGN = { positive: 1, negative: -1 } as const

/**
 * Derives the camera pose for standing in `opening` and looking into the model.
 * The camera sits at the opening center, at the opening's vertical middle above its
 * own floor, and looks horizontally along the wall normal toward the door's room side
 * when it has one, else toward the bounds interior.
 * `floorElevationMm` is the world elevation of that floor (the opening's heights are
 * measured on it). An empty (null) or zero-size scene, or an opening with a
 * zero-length wall normal, returns the fixed default pose.
 */
export function doorwayPose(
  opening: OpeningSceneNode,
  bounds: Bounds3 | null,
  floorElevationMm: number,
): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const { center, diagonal } = centerAndDiagonal(bounds)
  if (diagonal === 0) return DEFAULT_CAMERA_POSE
  const length = Math.hypot(opening.normal.x, opening.normal.y)
  if (length === 0) return DEFAULT_CAMERA_POSE
  const eye = floorElevationMm + opening.sillHeight + opening.height / 2
  const position = planToWorld(opening.center, eye)
  const normal = planToWorld({ x: opening.normal.x / length, y: opening.normal.y / length }, 0)
  const inward =
    opening.roomSide === undefined
      ? towardInterior(normal, position, center)
      : scaled(normal, ROOM_SIDE_SIGN[opening.roomSide])
  return {
    position,
    target: { x: position.x + inward.x, y: position.y, z: position.z + inward.z },
    up: WORLD_UP_Y,
    ...cameraDepthRange(diagonal),
  }
}
