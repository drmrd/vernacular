import * as THREE from 'three'
import { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js'

import type { EnvironmentLighting } from '../../core'

import type { LightingRig } from './lighting-rig'

/**
 * The visible sky and its light probe: the far-field procedural sky (the TSL SkyMesh
 * addon) plus the spherical-harmonic light probe that carries the same sky's diffuse
 * ambient. Both attach to an already-applied solar rig and are driven from the same
 * computed lighting the sun and shadow use.
 */

/** Half-extent the unit sky box scales to, large enough to enclose the scene as a far-field
 *  background; matches the scale three's own SkyMesh example applies. */
const SKY_SCALE = 450000
/** Cloud motion frozen: the addon animates clouds on `time`, which would make every scene
 *  baseline nondeterministic. Static clouds hold the render steady. */
const FROZEN_CLOUD_SPEED = 0
/** Pinned defensively: an addon default change to showSunDisc cannot silently drift scene
 *  baselines if this value is named and set explicitly here. */
const SUN_DISC_ON = 1
/** Pinned defensively: matches the r184 addon's own cloudScale default so an addon version
 *  bump cannot silently drift scene baselines. */
const CLOUD_SCALE = 0.0002
/** Pinned defensively: matches the r184 addon's own cloudDensity default so an addon version
 *  bump cannot silently drift scene baselines. */
const CLOUD_DENSITY = 0.4
/** Pinned defensively: matches the r184 addon's own cloudElevation default so an addon version
 *  bump cannot silently drift scene baselines. */
const CLOUD_ELEVATION = 0.5

/**
 * Adds the visible sky and its light probe to an applied rig and zeroes the
 * hemisphere fill (the probe carries the ambient; running both double-counts it).
 * Cloud motion is frozen (cloudSpeed 0) so scene baselines stay deterministic.
 */
export function attachSkyEnvironment(scene: THREE.Object3D, rig: LightingRig): void {
  const sky = new SkyMesh()
  sky.scale.setScalar(SKY_SCALE)
  sky.cloudSpeed.value = FROZEN_CLOUD_SPEED
  sky.showSunDisc.value = SUN_DISC_ON
  sky.cloudScale.value = CLOUD_SCALE
  sky.cloudDensity.value = CLOUD_DENSITY
  sky.cloudElevation.value = CLOUD_ELEVATION

  const probe = new THREE.LightProbe()

  rig.fill.intensity = 0
  scene.add(sky)
  scene.add(probe)
  rig.sky = sky
  rig.probe = probe
}

/** Drives the sky's sun position and cloud coverage plus the probe from the lighting. */
export function updateSkyEnvironment(rig: LightingRig, lighting: EnvironmentLighting): void {
  const { sky, probe } = rig
  if (sky !== undefined) {
    const { x, y, z } = lighting.sunDirection
    sky.sunPosition.value.set(x, y, z)
    sky.cloudCoverage.value = lighting.cloudCover
  }
  if (probe !== undefined) {
    probe.sh.fromArray(Array.from(lighting.skyAmbient))
  }
}
