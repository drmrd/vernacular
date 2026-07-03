import type * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'

import type { LightingProvider } from './lighting-provider'
import {
  buildLightingRig,
  DAYLIGHT_SUN_INTENSITY,
  findSun,
  fitSunShadowToDirection,
  setSunAndSkyColor,
} from './lighting-rig'

/** The sun switches fully off once below the horizon; the sky fill then carries the scene. */
const NIGHT_SUN_INTENSITY = 0

/**
 * Solar-aware lighting under the LightingProvider contract: `apply` builds the same
 * sun-plus-sky rig as the basic provider, and `update` re-aims and re-tints it from a
 * computed EnvironmentLighting so the light follows the site, date, and time. The sun's
 * intensity switches off with `sunUp`, so night scenes stay lit by the sky fill alone.
 */
export class SolarLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    buildLightingRig(scene, DAYLIGHT_SUN_INTENSITY)
  }

  /**
   * Re-tints the sun and sky, re-aims the sun and refits its shadow frustum when the
   * scene has bounds (a null bounds skips the refit per the LightingProvider contract),
   * and switches the sun's intensity with `sunUp`.
   */
  update(scene: THREE.Object3D, lighting: EnvironmentLighting, bounds: Bounds3 | null): void {
    setSunAndSkyColor(scene, lighting.sunColor, lighting.skyColor)
    if (bounds !== null) {
      fitSunShadowToDirection(scene, lighting.sunDirection, bounds)
    }
    const sun = findSun(scene)
    if (sun !== undefined) {
      sun.intensity = lighting.sunUp ? DAYLIGHT_SUN_INTENSITY : NIGHT_SUN_INTENSITY
    }
  }
}
