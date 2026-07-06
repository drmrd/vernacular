import type * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'
import type { LightingProvider } from './lighting-provider'
import {
  buildLightingRig,
  DAYLIGHT_SUN_INTENSITY,
  disposeLightingRig,
  type LightingRig,
} from './lighting-rig'

/** MVP lighting: one directional sun at a fixed angle plus a hemisphere fill. */
export class BasicLightingProvider implements LightingProvider {
  private rig: LightingRig | null = null

  apply(scene: THREE.Object3D): void {
    // Three r184's node renderer self-shadows steep faces wholesale under the schematic
    // sun angle regardless of bias tuning, on both the Metal and SwiftShader backends.
    // Casting is therefore scoped to realistic lighting as a provider policy, the same
    // way sun intensity is already a provider-owned parameter of buildLightingRig.
    // ADR-0153 records the investigation and the conditions for restoring schematic
    // shadows.
    this.rig = buildLightingRig(scene, DAYLIGHT_SUN_INTENSITY, false)
  }

  /** The schematic rig is static by design, so environment updates change nothing. */
  update(_scene: THREE.Object3D, _lighting: EnvironmentLighting, _bounds: Bounds3 | null): void {
    void _scene
    void _lighting
    void _bounds
  }

  dispose(scene: THREE.Object3D): void {
    if (this.rig === null) return
    disposeLightingRig(scene, this.rig)
    this.rig = null
  }
}
