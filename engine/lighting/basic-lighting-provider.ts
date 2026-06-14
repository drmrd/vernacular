import * as THREE from 'three'

import type { LightingProvider } from './lighting-provider'

/** Pure white light; the color-temperature tint is applied at the material in a later phase. */
const WHITE = 0xffffff
/** A neutral dark ground bounce for the hemisphere fill. */
const GROUND_FILL = 0x444444
/** A fixed default sun direction, raised toward +Y with an asymmetric azimuth (its X and
 *  Z components differ). The asymmetry turns the two perpendicular exterior walls toward
 *  the sun by different amounts, so they separate in value rather than reading equally lit
 *  (ADR-0079); the large +Y keeps it a high daytime key. Exported so the shadow fitter
 *  positions the sun along the same direction relative to the scene bounds. Treat it as
 *  read-only: it is a shared constant, and the fitter normalizes a clone of it once. */
export const SUN_DIRECTION = new THREE.Vector3(1, 2, 0.35)
// A key-dominant rig (ADR-0079): the sun runs brighter than the hemisphere fill so it
// sets the value of the faces it reaches, while the fill only keeps the unlit faces off
// black. An equal fill washed faces at different angles to the same value. A solar-aware
// provider can tune these independently later.
const SUN_INTENSITY = 1.6
const FILL_INTENSITY = 0.5
/** A 2048px square shadow map: enough resolution for the shell without a large GPU cost. */
const SHADOW_MAP_SIZE = 2048
/** A small negative depth bias to keep large flat faces (the floor) from self-shadowing into acne. */
const SHADOW_BIAS = -0.0005

/** MVP lighting: one directional sun at a fixed angle plus a hemisphere fill. */
export class BasicLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    const sun = new THREE.DirectionalLight(WHITE, SUN_INTENSITY)
    sun.position.copy(SUN_DIRECTION)
    sun.castShadow = true
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    sun.shadow.bias = SHADOW_BIAS
    const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
    scene.add(sun, fill)
  }
}
