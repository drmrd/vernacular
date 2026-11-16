import * as THREE from 'three'

import { DAYLIGHT_CALIBRATION, type EnvironmentLighting } from '../../core'

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
/* The four scattering constants are pinned defensively: each matches the r184 addon's own default
 * (turbidity, rayleigh, mieCoefficient, mieDirectionalG) so an addon version bump cannot silently
 * drift scene baselines. */
const TURBIDITY = 2
const RAYLEIGH = 1
const MIE_COEFFICIENT = 0.005
const MIE_DIRECTIONAL_G = 0.8

/**
 * The one scale between the visible sky mesh's output and the sky dome of `core`, which is the
 * authority for light. Measured in the scene harness and then frozen.
 *
 * Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame, AgX at exposure 1) in the equinox-noon state. Each reading is a region's encoded
 * luminance turned back into scene-linear luminance with agxNeutralInverse.
 *
 * Near the horizon: the 8 px square at x 236 to 243, y 0 to 7, away from the sun, looking 1.2
 * degrees above the horizon (view (-0.385, 0.021, -0.923)). The reading was taken at a
 * provisional gain of 0.25, because the tone curve is flat near the top, and scaled to a gain of
 * 1: 3.844. The dome target is 0.2447, so the gain is 0.0636. At that gain the region reads
 * 0.2450, a closed-loop residual of +0.12 percent.
 *
 * At the zenith: the sky reads 0.0328 at this gain against a dome of 0.4596, a ratio of 0.071.
 * One gain cannot match both places. The gain is fitted near the horizon. The zenith figure is an
 * order-of-magnitude one, because the tone curve inverse is exact only for neutral colors.
 *
 * The scattering constants above are pinned and are not tuned to close this difference.
 */
export const SKY_MESH_GAIN = 0.0636

/**
 * The per-channel gain the visible sky is scaled by. Dividing by the white point puts the
 * visible sky in the same white-balanced space as the sun and the dome. A new vector on each
 * call, so a caller may write to it without moving another's gain.
 */
export function skyMeshGain(): THREE.Vector3 {
  const { r, g, b } = DAYLIGHT_CALIBRATION.whitePoint
  return new THREE.Vector3(SKY_MESH_GAIN / r, SKY_MESH_GAIN / g, SKY_MESH_GAIN / b)
}

// The SkyMesh addon statically pulls in three/webgpu, which would land the whole WebGPU
// build in the app's entry chunk. Loading its module through a dynamic import keeps it on a
// separate lazy chunk, off the startup path; the promise is cached so repeated attaches
// (and, later, repeated solar-mode entries) share a single module load.
let skyMeshModule: Promise<typeof import('three/examples/jsm/objects/SkyMesh.js')> | undefined

function loadSkyMeshModule(): Promise<typeof import('three/examples/jsm/objects/SkyMesh.js')> {
  skyMeshModule ??= import('three/examples/jsm/objects/SkyMesh.js')
  return skyMeshModule
}

// The TSL module is loaded the same way, beside the SkyMesh module, so the uniform that carries
// the sky gain never puts three/tsl on the startup path either.
let tslModule: Promise<typeof import('three/tsl')> | undefined

function loadTslModule(): Promise<typeof import('three/tsl')> {
  tslModule ??= import('three/tsl')
  return tslModule
}

// A type-only alias for the resolved sky mesh, derived from the lazily loaded module's own
// type via `typeof import(...)` rather than a static `import type { SkyMesh } from ...`
// statement: the latter's `from '<specifier>'` text is exactly what the guard test below
// checks for, so this keeps the module's only reference to the specifier inside a dynamic
// `import(...)`, matching how `loadSkyMeshModule` above already refers to it.
type SkyMeshModule = typeof import('three/examples/jsm/objects/SkyMesh.js')
type TslModule = typeof import('three/tsl')
type SkyMesh = InstanceType<SkyMeshModule['SkyMesh']>
type SkyColorNode = NonNullable<SkyMesh['material']['colorNode']>
/** The one operation the gain needs from the addon's color node, narrowed from its union type. */
interface ScalableColorNode {
  mul(factor: unknown): SkyColorNode
}

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

/** Multiplies the sky's color by the sky mesh gain uniform and records that gain on the rig. The
 *  rig keeps the vector as a live handle on the uniform, so a writer of the vector changes the
 *  visible sky with no shader rebuild. The rig holds a gain only when the sky reads it: without
 *  an addon color node nothing is recorded. */
function applySkyGain(sky: SkyMesh, rig: LightingRig, tsl: TslModule): void {
  const gain = skyMeshGain()
  // The addon builds a vec4 (the sky color with alpha one), but its type says only "some node",
  // and the typed overloads of `mul` reject a vec3 uniform against that union. The shader widens
  // the uniform to a vec4 with alpha one, so the product keeps the sky opaque.
  const addonColor = sky.material.colorNode as ScalableColorNode | null
  if (addonColor === null) return
  sky.material.colorNode = addonColor.mul(tsl.uniform(gain))
  rig.skyGain = gain
}

/**
 * Adds the visible sky and its environment map to an applied rig and zeroes the hemisphere
 * fill (the map carries the ambient; running both double-counts it). The map attaches and the
 * fill zeroes synchronously, before the SkyMesh and three/tsl modules load; the sky is then
 * constructed, given its gain, and added once both lazily imported modules resolve, with cloud
 * motion frozen (cloudSpeed 0) so scene baselines stay deterministic. A rig disposed while the
 * modules are still loading abandons the attach: the sky never joins the scene and the promise
 * resolves without error.
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
  let tsl: TslModule
  try {
    ;[loadedModule, tsl] = await Promise.all([loadSkyMeshModule(), loadTslModule()])
  } catch (reason) {
    console.warn(
      'Failed to load the visible sky modules (three/examples/jsm/objects/SkyMesh.js, three/tsl); realistic lighting continues without it',
      reason,
    )
    return
  }
  if (rig.disposed === true) return

  const { SkyMesh } = loadedModule
  const sky = new SkyMesh()
  sky.scale.setScalar(SKY_SCALE)
  sky.turbidity.value = TURBIDITY
  sky.rayleigh.value = RAYLEIGH
  sky.mieCoefficient.value = MIE_COEFFICIENT
  sky.mieDirectionalG.value = MIE_DIRECTIONAL_G
  sky.cloudSpeed.value = FROZEN_CLOUD_SPEED
  sky.showSunDisc.value = SUN_DISC_ON
  sky.cloudScale.value = CLOUD_SCALE
  sky.cloudDensity.value = CLOUD_DENSITY
  sky.cloudElevation.value = CLOUD_ELEVATION
  applySkyGain(sky, rig, tsl)
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
