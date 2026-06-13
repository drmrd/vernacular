import * as THREE from 'three'

import type { Bounds3, LinearRgb } from '../../core'

import { SUN_DIRECTION } from './basic-lighting-provider'

const SHADOW_DISTANCE_FACTOR = 3
const MIN_SHADOW_NEAR = 1
/** The sun direction as a unit vector, normalized once so the per-call fitter does not allocate. */
const SUN_DIRECTION_NORMALIZED = SUN_DIRECTION.clone().normalize()

/**
 * Operations on a lighting rig already applied to a scene (see BasicLightingProvider).
 * The lights live on the persistent render scene, so the color updates in place when the
 * color temperature changes, without a rebuild.
 */
function isRigLight(
  child: THREE.Object3D,
): child is THREE.DirectionalLight | THREE.HemisphereLight {
  return child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight
}

/** Tints the sun and the hemisphere sky to a linear-light color. */
export function setLightingColor(scene: THREE.Object3D, color: LinearRgb): void {
  for (const child of scene.children) {
    if (isRigLight(child)) {
      child.color.setRGB(color.r, color.g, color.b, THREE.LinearSRGBColorSpace)
    }
  }
}

/** Removes the rig's lights so a remount re-applies cleanly rather than stacking them. */
export function removeLighting(scene: THREE.Object3D): void {
  // Snapshot the targets before removing, so the removal does not mutate the array
  // being iterated, and so the intent mirrors the for-of guard in setLightingColor.
  const lights = scene.children.filter(isRigLight)
  for (const light of lights) {
    scene.remove(light)
  }
}

/**
 * Positions the sun along its fixed direction outside the scene bounds and sizes its
 * orthographic shadow camera to cover them, so the shell casts a shadow without wasting
 * shadow-map resolution. The light direction is preserved.
 */
export function fitSunShadowToBounds(scene: THREE.Object3D, bounds: Bounds3 | null): void {
  if (bounds === null) return
  const sun = scene.children.find((child) => child instanceof THREE.DirectionalLight) as
    | THREE.DirectionalLight
    | undefined
  if (sun === undefined) return

  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  )
  const radius =
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ) / 2
  const distance = radius * SHADOW_DISTANCE_FACTOR

  sun.position.copy(center).addScaledVector(SUN_DIRECTION_NORMALIZED, distance)
  sun.target.position.copy(center)
  sun.target.updateMatrixWorld()

  const camera = sun.shadow.camera
  camera.left = -radius
  camera.right = radius
  camera.top = radius
  camera.bottom = -radius
  // Near plane at the sun-facing edge of the bounding sphere, far plane past its far edge.
  camera.near = Math.max(MIN_SHADOW_NEAR, distance - radius)
  camera.far = distance + radius
  camera.updateProjectionMatrix()
}
