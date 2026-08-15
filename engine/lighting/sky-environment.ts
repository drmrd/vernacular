import * as THREE from 'three'

import type { EnvironmentLighting } from '../../core'

import { asScene, type LightingRig } from './lighting-rig'
import { createSkyEnvironmentTexture, writeSkyEnvironmentTexture } from './sky-environment-map'

/**
 * The visible sky and its image-based light: the far-field procedural sky (the TSL SkyMesh
 * addon) plus the equirectangular radiance map that carries the same sky's ambient. Both
 * attach to an already-applied solar rig and are driven from the same computed lighting the
 * sun and shadow use.
 */

/**
 * The scale between the map's stored radiance and the light the render receives. It is one
 * because the map carries absolute linear radiance, the same quantity the light probe
 * carried before it, so nothing stands between the sky model and the render. Set explicitly
 * rather than left to three's default so a default change cannot silently move the
 * reference condition ADR-0156 fixes the color-accuracy gate against.
 */
const ENVIRONMENT_INTENSITY = 1

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

/**
 * Builds the sky's environment map, records it on the rig, and hands it to the scene at the
 * calibration convention's unscaled intensity. Only a Scene carries an environment, so a
 * provider applied to a bare Object3D still gets its lights and the map simply has nowhere
 * to land; the rig keeps it either way so teardown has exactly one thing to free.
 */
function attachEnvironmentMap(scene: THREE.Object3D, rig: LightingRig): void {
  const environment = createSkyEnvironmentTexture()
  rig.environment = environment
  const renderScene = asScene(scene)
  if (renderScene === undefined) return
  renderScene.environment = environment
  renderScene.environmentIntensity = ENVIRONMENT_INTENSITY
}

/** Applies the lighting's sun aim and cloud coverage to a resolved sky. Shared by the attach
 *  replay and updateSkyEnvironment so the two writers cannot drift out of lockstep. */
function applySkyLighting(sky: SkyMesh, lighting: EnvironmentLighting): void {
  const { x, y, z } = lighting.sunDirection
  sky.sunPosition.value.set(x, y, z)
  sky.cloudCoverage.value = lighting.cloudCover
}

/**
 * Adds the visible sky and its environment map to an applied rig and zeroes the hemisphere
 * fill (the map carries the ambient; running both double-counts it). The map attaches and the
 * fill zeroes synchronously, before the SkyMesh module loads; the sky is then constructed and
 * added once its lazily imported module resolves, with cloud motion frozen (cloudSpeed 0) so
 * scene baselines stay deterministic. A rig disposed while the module is still loading
 * abandons the attach: the sky never joins the scene and the promise resolves without error.
 * A failed dynamic import (e.g. a stale chunk URL after a redeploy) is caught here rather than
 * left to the caller: it warns and returns, leaving rig.sky undefined and the promise resolved,
 * so the scene stays lit by the environment and fill already applied synchronously above, just
 * without the visible sky. Call once per freshly built rig.
 *
 * The map starts black and is filled by the first `updateSkyEnvironment`, the same way the
 * light probe it replaced started at zero harmonics.
 */
export async function attachSkyEnvironment(scene: THREE.Object3D, rig: LightingRig): Promise<void> {
  rig.fill.intensity = 0
  attachEnvironmentMap(scene, rig)

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
 * Whether two sky ambients are the same. Compared by value rather than by array
 * identity: the environment pipeline builds a fresh coefficient array every tick, so the
 * same sky arrives as a different array, and comparing references would rewrite the map on
 * every update. Twenty-seven numbers is a far cheaper comparison than the rewrite it avoids.
 */
function sameAmbient(held: readonly number[] | undefined, incoming: readonly number[]): boolean {
  if (held === undefined || held.length !== incoming.length) return false
  return held.every((coefficient, index) => coefficient === incoming[index])
}

/**
 * Drives the sky's sun position and cloud coverage plus the environment map from the
 * lighting. The map exists synchronously, so it is always driven; when the sky is still
 * loading the lighting is stashed on the rig (latest wins) for the attach to replay once the
 * sky arrives.
 */
export function updateSkyEnvironment(rig: LightingRig, lighting: EnvironmentLighting): void {
  const { sky, environment } = rig
  if (sky !== undefined) {
    applySkyLighting(sky, lighting)
  } else {
    rig.pendingLighting = lighting
  }
  if (environment !== undefined && !sameAmbient(rig.environmentAmbient, lighting.skyAmbient)) {
    writeSkyEnvironmentTexture(environment, lighting.skyAmbient)
    rig.environmentAmbient = lighting.skyAmbient
  }
}
