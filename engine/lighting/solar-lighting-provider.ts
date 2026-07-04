import type * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'

import type { LightingProvider } from './lighting-provider'
import {
  buildLightingRig,
  DAYLIGHT_SUN_INTENSITY,
  disposeLightingRig,
  fitSunShadowToDirection,
  setSunAndSkyColor,
  setSunIntensity,
  type LightingRig,
} from './lighting-rig'
import { attachSkyEnvironment, updateSkyEnvironment } from './sky-environment'

/**
 * Solar-aware lighting under the LightingProvider contract: `apply` builds the same
 * sun-plus-sky rig as the basic provider, and `update` re-aims and re-tints it from a
 * computed EnvironmentLighting so the light follows the site, date, and time. The sun's
 * intensity fades with the environment `sunIntensity` scalar, which carries the horizon
 * extinction ramp, so night scenes stay lit by the sky's light probe ambient rather than
 * the fill, which realistic mode zeroes.
 */
export class SolarLightingProvider implements LightingProvider {
  private rig: LightingRig | null = null

  apply(scene: THREE.Object3D): void {
    this.rig = buildLightingRig(scene, DAYLIGHT_SUN_INTENSITY)
    // The visible sky loads off the startup path; fire-and-forget its attach so `apply` stays
    // synchronous. `dispose` marks the rig, which abandons the attach if it is still in flight.
    void attachSkyEnvironment(scene, this.rig)
  }

  /**
   * Re-tints the sun and sky, re-aims the sun and refits its shadow frustum when the
   * scene has bounds (a null bounds skips the refit per the LightingProvider contract),
   * and scales the sun's intensity by the environment `sunIntensity` fraction.
   */
  update(scene: THREE.Object3D, lighting: EnvironmentLighting, bounds: Bounds3 | null): void {
    const rig = this.rig
    if (rig === null) return
    setSunAndSkyColor(scene, lighting.sunColor, lighting.skyColor)
    if (bounds !== null) {
      fitSunShadowToDirection(scene, lighting.sunDirection, bounds)
    }
    setSunIntensity(scene, DAYLIGHT_SUN_INTENSITY * lighting.sunIntensity)
    updateSkyEnvironment(rig, lighting)
  }

  dispose(scene: THREE.Object3D): void {
    if (this.rig === null) return
    disposeLightingRig(scene, this.rig)
    this.rig = null
  }
}
