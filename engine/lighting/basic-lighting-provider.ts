import * as THREE from 'three'

import type { LightingProvider } from './lighting-provider'

/** Pure white light; the color-temperature tint is applied at the material in a later phase. */
const WHITE = 0xffffff
/** A neutral dark ground bounce for the hemisphere fill. */
const GROUND_FILL = 0x444444
const SUN_INTENSITY = 1
const FILL_INTENSITY = 1

/** MVP lighting: one directional sun at a fixed angle plus a hemisphere fill. */
export class BasicLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    const sun = new THREE.DirectionalLight(WHITE, SUN_INTENSITY)
    sun.position.set(1, 2, 1)
    const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
    scene.add(sun, fill)
  }
}
