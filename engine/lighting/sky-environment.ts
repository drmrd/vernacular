import * as THREE from 'three'

import type { EnvironmentLighting } from '../../core'

import type { LightingRig } from './lighting-rig'

/**
 * The visible sky and its light probe: the far-field procedural sky (the TSL SkyMesh
 * addon) plus the spherical-harmonic light probe that carries the same sky's diffuse
 * ambient. Both attach to an already-applied solar rig and are driven from the same
 * computed lighting the sun and shadow use.
 */

/** Half-extent the unit sky box scales to, large enough to enclose the scene as a far-field
 *  background. This is the classic three.js sky example's scale; the addon's own JSDoc example
 *  uses a smaller 10000, so the exact value is a far-field choice, not an addon default. */
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

// The SkyMesh addon statically pulls in three/webgpu, which would land the whole WebGPU
// build in the app's entry chunk. Loading its module through a dynamic import keeps it on a
// separate lazy chunk, off the startup path; the promise is cached so repeated attaches
// (and, later, repeated solar-mode entries) share a single module load.
let skyMeshModule: Promise<typeof import('three/examples/jsm/objects/SkyMesh.js')> | undefined

function loadSkyMeshModule(): Promise<typeof import('three/examples/jsm/objects/SkyMesh.js')> {
  skyMeshModule ??= import('three/examples/jsm/objects/SkyMesh.js')
  return skyMeshModule
}

// A type-only alias for the resolved sky mesh, derived from the lazily loaded module's own
// type via `typeof import(...)` rather than a static `import type { SkyMesh } from ...`
// statement: the latter's `from '<specifier>'` text is exactly what the guard test below
// checks for, so this keeps the module's only reference to the specifier inside a dynamic
// `import(...)`, matching how `loadSkyMeshModule` above already refers to it.
type SkyMeshModule = typeof import('three/examples/jsm/objects/SkyMesh.js')
type SkyMesh = InstanceType<SkyMeshModule['SkyMesh']>

/** Applies the lighting's sun aim and cloud coverage to a resolved sky. Shared by the attach
 *  replay and updateSkyEnvironment so the two writers cannot drift out of lockstep. */
function applySkyLighting(sky: SkyMesh, lighting: EnvironmentLighting): void {
  const { x, y, z } = lighting.sunDirection
  sky.sunPosition.value.set(x, y, z)
  sky.cloudCoverage.value = lighting.cloudCover
}

/**
 * Adds the visible sky and its light probe to an applied rig and zeroes the hemisphere fill
 * (the probe carries the ambient; running both double-counts it). The probe attaches and the
 * fill zeroes synchronously, before the SkyMesh module loads; the sky is then constructed and
 * added once its lazily imported module resolves, with cloud motion frozen (cloudSpeed 0) so
 * scene baselines stay deterministic. A rig disposed while the module is still loading
 * abandons the attach: the sky never joins the scene and the promise resolves without error.
 * A failed dynamic import (e.g. a stale chunk URL after a redeploy) is caught here rather than
 * left to the caller: it warns and returns, leaving rig.sky undefined and the promise resolved,
 * so the scene stays lit by the probe and fill already applied synchronously above, just without
 * the visible sky. Call once per freshly built rig; a second call would add a second probe.
 */
export async function attachSkyEnvironment(scene: THREE.Object3D, rig: LightingRig): Promise<void> {
  const probe = new THREE.LightProbe()
  rig.fill.intensity = 0
  scene.add(probe)
  rig.probe = probe

  let loadedModule: SkyMeshModule
  try {
    loadedModule = await loadSkyMeshModule()
  } catch (reason) {
    console.warn(
      'Failed to load the visible sky module (three/examples/jsm/objects/SkyMesh.js); realistic lighting continues without it',
      reason,
    )
    return
  }
  if (rig.disposed === true) return

  const { SkyMesh } = loadedModule
  const sky = new SkyMesh()
  sky.scale.setScalar(SKY_SCALE)
  sky.cloudSpeed.value = FROZEN_CLOUD_SPEED
  sky.showSunDisc.value = SUN_DISC_ON
  sky.cloudScale.value = CLOUD_SCALE
  sky.cloudDensity.value = CLOUD_DENSITY
  sky.cloudElevation.value = CLOUD_ELEVATION
  scene.add(sky)
  rig.sky = sky

  const stashed = rig.pendingLighting
  if (stashed !== undefined) {
    applySkyLighting(sky, stashed)
    rig.pendingLighting = undefined
  }
}

/**
 * Drives the sky's sun position and cloud coverage plus the probe from the lighting. The
 * probe exists synchronously, so it is always driven; when the sky is still loading the
 * lighting is stashed on the rig (latest wins) for the attach to replay once the sky arrives.
 */
export function updateSkyEnvironment(rig: LightingRig, lighting: EnvironmentLighting): void {
  const { sky, probe } = rig
  if (sky !== undefined) {
    applySkyLighting(sky, lighting)
  } else {
    rig.pendingLighting = lighting
  }
  if (probe !== undefined) {
    probe.sh.fromArray(Array.from(lighting.skyAmbient))
  }
}
