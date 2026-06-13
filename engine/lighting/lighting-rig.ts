import * as THREE from 'three'

import type { LinearRgb } from '../../core'

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
