import { frameSceneCamera, type Bounds3 } from '../../core'

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
  near: number
  far: number
  lookAt(x: number, y: number, z: number): void
  updateProjectionMatrix(): void
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
    fovRadians: (camera.fov ?? DEFAULT_FOV_DEGREES) * DEGREES_TO_RADIANS,
  })
  camera.position.set(pose.position.x, pose.position.y, pose.position.z)
  camera.near = pose.near
  camera.far = pose.far
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
  camera.updateProjectionMatrix()
}
