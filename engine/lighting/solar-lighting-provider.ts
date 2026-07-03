import * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'

import { SUN_DIRECTION } from './basic-lighting-provider'
import type { LightingProvider } from './lighting-provider'
import { fitSunShadowToDirection, setSunAndSkyColor } from './lighting-rig'

/** Pure white at creation; `update` re-tints both lights from the computed environment. */
const WHITE = 0xffffff
/** A neutral dark ground bounce for the hemisphere fill. */
const GROUND_FILL = 0x444444
/** The daytime sun strength; mirrors the basic provider's key-dominant sun (ADR-0079). */
const DAYLIGHT_SUN_INTENSITY = 1.6
/** The sun switches fully off once below the horizon; the sky fill then carries the scene. */
const NIGHT_SUN_INTENSITY = 0
/** The hemisphere fill stays on day and night so a night scene reads by sky light alone. */
const FILL_INTENSITY = 0.5
/** A 2048px square shadow map: enough resolution for the shell without a large GPU cost. */
const SHADOW_MAP_SIZE = 2048
/** A small negative depth bias to keep large flat faces (the floor) from self-shadowing into acne. */
const SHADOW_BIAS = -0.0005

/**
 * Solar-aware lighting under the LightingProvider contract: `apply` builds the same
 * sun-plus-sky rig as the basic provider, and `update` re-aims and re-tints it from a
 * computed EnvironmentLighting so the light follows the site, date, and time. The sun's
 * intensity switches off with `sunUp`, so night scenes stay lit by the sky fill alone.
 */
export class SolarLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    const sun = new THREE.DirectionalLight(WHITE, DAYLIGHT_SUN_INTENSITY)
    sun.position.copy(SUN_DIRECTION)
    sun.castShadow = true
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    sun.shadow.bias = SHADOW_BIAS
    const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
    scene.add(sun, fill)
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
    const sun = scene.children.find((child) => child instanceof THREE.DirectionalLight) as
      | THREE.DirectionalLight
      | undefined
    if (sun !== undefined) {
      sun.intensity = lighting.sunUp ? DAYLIGHT_SUN_INTENSITY : NIGHT_SUN_INTENSITY
    }
  }
}
