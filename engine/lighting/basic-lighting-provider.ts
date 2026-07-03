import type * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'
import type { LightingProvider } from './lighting-provider'
import { buildLightingRig, DAYLIGHT_SUN_INTENSITY } from './lighting-rig'

/** MVP lighting: one directional sun at a fixed angle plus a hemisphere fill. */
export class BasicLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    buildLightingRig(scene, DAYLIGHT_SUN_INTENSITY)
  }

  /** The schematic rig is static by design, so environment updates change nothing. */
  update(_scene: THREE.Object3D, _lighting: EnvironmentLighting, _bounds: Bounds3 | null): void {
    void _scene
    void _lighting
    void _bounds
  }
}
