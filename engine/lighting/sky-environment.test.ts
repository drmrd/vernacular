import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  evaluateSphericalHarmonics,
  SH_COEFFICIENT_COUNT,
  type EnvironmentLighting,
} from '../../core'
import { importsStaticValueOf } from '../testing'
import { attachSkyEnvironment, updateSkyEnvironment } from './sky-environment'
import { SKY_ENVIRONMENT_WIDTH, SKY_ENVIRONMENT_HEIGHT } from './sky-environment-map'
import { buildLightingRig, disposeLightingRig, type LightingRig } from './lighting-rig'

/** The sun intensity the rig is built with; any positive value is fine for these tests. */
const RIG_SUN_INTENSITY = 1.6
/** A recognizable non-neutral sun aim with distinct components, so a copy is unambiguous. */
const SUN_DIRECTION = { x: 0.3, y: 0.8, z: -0.5 }
/** A cloud fraction distinct from the SkyMesh addon default (0.4), so a passthrough shows. */
const CLOUD_COVER = 0.72
/** A band-0 term large enough to hold the reconstructed dome positive everywhere, so the
 *  assertions below read real radiance rather than the zero clamp. */
const DOMINANT_BAND_0 = 30
/**
 * Twenty-seven distinct spherical-harmonic coefficients, one per flat index, so the
 * reconstruction reads every band and index rather than only the average. The three
 * band-0 channels dominate (see above); the rest stay distinct.
 */
const DISTINCT_SKY_AMBIENT: readonly number[] = Array.from(
  { length: SH_COEFFICIENT_COUNT },
  (_, index) => (index < 3 ? DOMINANT_BAND_0 : (index + 1) / 10),
)
/** Reconstruction and passthrough are exact copies; a loose float tolerance suffices. */
const PRECISION = 5

function makeLighting(): EnvironmentLighting {
  return {
    sunDirection: SUN_DIRECTION,
    sunColor: { r: 0.9, g: 0.8, b: 0.6 },
    skyColor: { r: 0.4, g: 0.55, b: 0.9 },
    sunIntensity: 1.2,
    cloudCover: CLOUD_COVER,
    skyAmbient: DISTINCT_SKY_AMBIENT,
  }
}

/** A scene with the solar rig already applied: the state attachSkyEnvironment expects. */
function makeAppliedRig(): { scene: THREE.Scene; rig: LightingRig } {
  const scene = new THREE.Scene()
  const rig = buildLightingRig(scene, RIG_SUN_INTENSITY)
  return { scene, rig }
}

/** True when the scene carries a visible sky mesh, read via the addon's own marker flag so
 *  the test never has to statically import (and so bundle) the SkyMesh addon itself. */
function sceneHasSkyMesh(scene: THREE.Object3D): boolean {
  return scene.children.some((child) => (child as { isSkyMesh?: boolean }).isSkyMesh === true)
}

/** A texel roughly at the zenith, where the reconstructed dome is brightest and positive. */
const ZENITH_ROW = SKY_ENVIRONMENT_HEIGHT - 1
const ZENITH_COLUMN = 0

/** The direction three samples a texel from, inverting its `equirectUV` (see ADR-0161). */
function directionOfTexel(column: number, row: number): { x: number; y: number; z: number } {
  const elevation = ((row + 0.5) / SKY_ENVIRONMENT_HEIGHT - 0.5) * Math.PI
  const azimuth = ((column + 0.5) / SKY_ENVIRONMENT_WIDTH - 0.5) * 2 * Math.PI
  const horizontalRadius = Math.cos(elevation)
  return {
    x: horizontalRadius * Math.cos(azimuth),
    y: Math.sin(elevation),
    z: horizontalRadius * Math.sin(azimuth),
  }
}

/** Reads one texel's red channel back out of the environment map's half-float buffer. */
function texelRed(texture: THREE.DataTexture, column: number, row: number): number {
  const data = texture.image.data as Uint16Array
  return THREE.DataUtils.fromHalfFloat(data[(row * SKY_ENVIRONMENT_WIDTH + column) * 4]!)
}

/**
 * Asserts the environment map carries makeLighting's distinct sky-ambient harmonics: the
 * zenith texel reconstructs to what those coefficients evaluate to in that direction. The
 * map replaced the light probe as the carrier of the sky's ambient (ADR-0161), so this is
 * where the harmonics now have to land.
 */
function expectEnvironmentCarriesDistinctAmbient(rig: LightingRig): void {
  const texture = rig.environment
  expect(texture).toBeDefined()
  const expected = evaluateSphericalHarmonics(
    DISTINCT_SKY_AMBIENT,
    directionOfTexel(ZENITH_COLUMN, ZENITH_ROW),
  )
  expect(expected.r).toBeGreaterThan(0)
  expect(texelRed(texture!, ZENITH_COLUMN, ZENITH_ROW)).toBeCloseTo(expected.r, 2)
}

/** Asserts the sky's sun aim and cloud coverage match makeLighting's distinct values. */
function expectSkyMatchesLighting(rig: LightingRig): void {
  const sunPosition = rig.sky?.sunPosition.value
  expect(sunPosition?.x).toBeCloseTo(SUN_DIRECTION.x, PRECISION)
  expect(sunPosition?.y).toBeCloseTo(SUN_DIRECTION.y, PRECISION)
  expect(sunPosition?.z).toBeCloseTo(SUN_DIRECTION.z, PRECISION)
  expect(rig.sky?.cloudCoverage.value).toBeCloseTo(CLOUD_COVER, PRECISION)
}

describe('attachSkyEnvironment', () => {
  it('assigns the scene environment and zeroes the fill synchronously, before the sky loads', () => {
    const { scene, rig } = makeAppliedRig()
    expect(rig.fill.intensity).toBeGreaterThan(0)

    attachSkyEnvironment(scene, rig)

    // The environment map attaches and the fill is zeroed synchronously so the scene is
    // never momentarily unlit; the visible sky mesh may still be loading (asserted below).
    expect(rig.environment).toBeInstanceOf(THREE.DataTexture)
    expect(scene.environment).toBe(rig.environment)
    expect(rig.fill.intensity).toBe(0)
  })

  it('carries the sky ambient as an environment map rather than a light probe', () => {
    const { scene, rig } = makeAppliedRig()

    attachSkyEnvironment(scene, rig)

    // The environment map supplies BOTH the diffuse irradiance the probe used to carry and
    // the specular radiance the probe could not, so keeping a probe alongside it would
    // double-count the sky's diffuse ambient exactly as the hemisphere fill once did
    // (ADR-0148's reasoning, applied one step further; ADR-0161). The rig stopped
    // carrying a probe at all, so nothing is left to retire later.
    expect(scene.children.some((child) => child instanceof THREE.LightProbe)).toBe(false)
  })

  it('leaves the environment at the unscaled intensity the calibration convention fixes', () => {
    const { scene, rig } = makeAppliedRig()

    attachSkyEnvironment(scene, rig)

    // The map carries absolute linear radiance, the same quantity the probe carried, so no
    // scaling stands between it and the render. ADR-0156 fixes the reference condition and
    // this keeps the environment inside it rather than introducing a second exposure knob.
    expect(scene.environmentIntensity).toBe(1)
  })

  it('resolves once the lazily loaded sky mesh is attached, frozen, and recorded on the rig', async () => {
    const { scene, rig } = makeAppliedRig()

    const attached = attachSkyEnvironment(scene, rig)

    // attach hands back a promise so callers can await the sky, whose addon is loaded
    // off the startup path via a dynamic import rather than a static one.
    expect(attached).toBeInstanceOf(Promise)
    await attached

    expect(rig.sky?.isSkyMesh).toBe(true)
    expect(scene.children).toContain(rig.sky)
    expect(rig.sky?.cloudSpeed.value).toBe(0)
    expect(rig.sky?.showSunDisc.value).toBe(1)
  })

  it('replays an update issued before the sky resolves onto the sky once it arrives', async () => {
    const { scene, rig } = makeAppliedRig()

    const attached = attachSkyEnvironment(scene, rig)
    expect(attached).toBeInstanceOf(Promise)
    updateSkyEnvironment(rig, makeLighting())

    // The environment map exists synchronously, so the ambient lands immediately even
    // while the sky is still loading: the harmonics reconstruct into the map right away.
    expectEnvironmentCarriesDistinctAmbient(rig)

    await attached

    // The update ran before the sky was attached, so attach must stash the latest
    // lighting and replay it: the resolved sky carries that same sun aim and clouds.
    expectSkyMatchesLighting(rig)
  })

  it('clears the stashed pending lighting once it has been replayed onto the resolved sky', async () => {
    const { scene, rig } = makeAppliedRig()

    const attached = attachSkyEnvironment(scene, rig)
    updateSkyEnvironment(rig, makeLighting())

    // While the sky is still loading there is nowhere to write the update, so it is
    // stashed on the rig for replay the moment the sky arrives.
    expect(rig.pendingLighting).toBeDefined()

    await attached

    // The stash only holds lighting seen BEFORE the sky arrived. Once the attach replays
    // it onto the freshly built sky the stash is consumed, so it must be cleared: a later
    // update after the sky exists writes straight through, never through the stash.
    expect(rig.pendingLighting).toBeUndefined()
  })
})

describe('updateSkyEnvironment', () => {
  it("aims the sky's sun position at the lighting's sun direction", async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    const sunPosition = rig.sky?.sunPosition.value
    expect(sunPosition?.x).toBeCloseTo(SUN_DIRECTION.x, PRECISION)
    expect(sunPosition?.y).toBeCloseTo(SUN_DIRECTION.y, PRECISION)
    expect(sunPosition?.z).toBeCloseTo(SUN_DIRECTION.z, PRECISION)
  })

  it("drives the sky's cloud coverage from the lighting's cloud cover", async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    expect(rig.sky?.cloudCoverage.value).toBeCloseTo(CLOUD_COVER, PRECISION)
  })

  it("reconstructs the lighting's sky-ambient harmonics into the environment map", async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    expectEnvironmentCarriesDistinctAmbient(rig)
  })
})

describe('disposeLightingRig', () => {
  it('abandons a sky that is still loading when the rig is disposed first, adding no sky', async () => {
    const { scene, rig } = makeAppliedRig()

    const attached = attachSkyEnvironment(scene, rig)
    disposeLightingRig(scene, rig)

    // Disposing before the lazy load resolves must not reject and must not slip the
    // abandoned sky back into a torn-down scene: the resolved attach is a no-op.
    await attached

    expect(sceneHasSkyMesh(scene)).toBe(false)
    expect(rig.sky).toBeUndefined()
  })

  it('removes and disposes the sky when the rig owns it', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    const sky = rig.sky!
    const geometryDispose = vi.spyOn(sky.geometry, 'dispose')
    const materialDispose = vi.spyOn(sky.material, 'dispose')

    disposeLightingRig(scene, rig)

    expect(scene.children).not.toContain(sky)
    expect(geometryDispose).toHaveBeenCalled()
    expect(materialDispose).toHaveBeenCalled()
  })

  it('still tears down a rig that has no sky or probe', () => {
    const scene = new THREE.Scene()
    const rig = buildLightingRig(scene, RIG_SUN_INTENSITY)

    expect(() => disposeLightingRig(scene, rig)).not.toThrow()

    expect(scene.children).not.toContain(rig.sun)
    expect(scene.children).not.toContain(rig.fill)
  })
})

describe('sky-environment module imports', () => {
  // This is a source-reading guard, not a behavior test. It pins a *bundling* property no
  // runtime assertion can observe: this module must not STATICALLY import the SkyMesh addon
  // or three/webgpu. Either one drags the whole WebGPU node-material system onto the app's
  // startup path. When this module statically imported the SkyMesh addon (which itself
  // statically imports three/webgpu), the app's entry chunk grew from ~2.0MB to ~2.6MB (the
  // deliberately lazy three.webgpu chunk folded into the entry), and cold startup slowed
  // enough to make e2e/tests/environment-panel.spec.ts flaky on firefox under parallel load.
  // The sky mesh must load lazily at attach time. See engine/testing/import-guards.ts for how
  // the static-vs-type-vs-dynamic import distinction is made; that helper is shared with the
  // equivalent ambient-occlusion.test.ts guard.
  it('never puts the SkyMesh addon or three/webgpu on the startup path via a static import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/lighting/sky-environment.ts'),
      'utf8',
    )

    expect(importsStaticValueOf(source, 'three/examples/jsm/objects/SkyMesh.js')).toBe(false)
    expect(importsStaticValueOf(source, 'three/webgpu')).toBe(false)
  })
})
