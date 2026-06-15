import { frameSceneCamera, type Bounds3, type CameraPose } from '../../core'

/** The renderer's default perspective field of view, used when a camera does
 *  not expose its own `fov`. */
const DEFAULT_FOV_DEGREES = 75
/** Conversion factor from degrees to radians (pi radians per 180 degrees). */
// eslint-disable-next-line no-magic-numbers -- 180 is the half-turn in degrees, an inherent unit-conversion constant
const DEGREES_TO_RADIANS = Math.PI / 180

/**
 * The minimal structural shape of a perspective camera that {@link fitCameraToBounds}
 * mutates. Typed structurally rather than as `THREE.PerspectiveCamera` so the
 * bridge layer does not import three (engine is the only three importer).
 */
export interface FittableCamera {
  fov?: number | undefined
  position: { set(x: number, y: number, z: number): void }
  up?: { set(x: number, y: number, z: number): void }
  near: number
  far: number
  lookAt(x: number, y: number, z: number): void
  updateProjectionMatrix(): void
}

/** The renderer's default world up direction (+Y), used when a pose does not
 *  specify its own up vector. */
const WORLD_UP = { x: 0, y: 1, z: 0 }

/**
 * Converts a camera's field of view to radians, falling back to the renderer's
 * {@link DEFAULT_FOV_DEGREES} when the camera does not expose its own `fov`.
 * Shared by the live preview and the preset poses so both read field of view the
 * same way.
 */
export function fovToRadians(camera: FittableCamera): number {
  return (camera.fov ?? DEFAULT_FOV_DEGREES) * DEGREES_TO_RADIANS
}

/**
 * Snaps the camera to an explicit {@link CameraPose}: position, near/far clip
 * planes, up vector, and look-at target. Sets the up vector before `lookAt`
 * because three derives the camera orientation from up. A pose without an `up`
 * resets the camera to world up (+Y).
 */
export function applyCameraPose(camera: FittableCamera, pose: CameraPose): void {
  const up = pose.up ?? WORLD_UP
  camera.position.set(pose.position.x, pose.position.y, pose.position.z)
  camera.near = pose.near
  camera.far = pose.far
  camera.up?.set(up.x, up.y, up.z)
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
  camera.updateProjectionMatrix()
}

/**
 * Frames the given world bounds in the camera, delegating the fit math to the
 * pure {@link frameSceneCamera} core function and applying the resulting pose.
 * Shared by the live 3D preview and the deterministic render harness so both
 * fit the model to the live canvas aspect ratio and field of view.
 */
export function fitCameraToBounds(
  camera: FittableCamera,
  bounds: Bounds3 | null,
  size: { width: number; height: number },
): void {
  const pose = frameSceneCamera(bounds, {
    aspect: size.width / size.height,
    fovRadians: fovToRadians(camera),
  })
  applyCameraPose(camera, pose)
}
