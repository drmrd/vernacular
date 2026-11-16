/* eslint-disable max-lines --
 * One describe block per sky-environment entry point (attach, gain, update, dispose, bundle
 * guard). The attach block grows one case per addon behavior the module must survive, and
 * the per-file line cap does not suit a behavior-organized suite that wraps the lazy addon. */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import type { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js'
import {
  DAYLIGHT_CALIBRATION,
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  type EnvironmentLighting,
} from '../../core'
import { importsStaticValueOf } from '../testing'
import {
  SKY_MESH_GAIN,
  attachSkyEnvironment,
  skyMeshGain,
  updateSkyEnvironment,
} from './sky-environment'
import { buildLightingRig, disposeLightingRig, type LightingRig } from './lighting-rig'

/** The sun intensity the rig is built with; any positive value is fine for these tests. */
const RIG_SUN_INTENSITY = 1.6
/** A recognizable non-neutral sun aim with distinct components, so a copy is unambiguous. */
const SUN_DIRECTION = { x: 0.3, y: 0.8, z: -0.5 }
/** A cloud fraction distinct from the SkyMesh addon default (0.4), so a passthrough shows. */
const CLOUD_COVER = 0.72
/**
 * A uniform dome at a distinctive radiance. Uniform is pure band 0, so it reconstructs to
 * exactly this value in every direction, which lets these tests assert the map's contents
 * without restating the texel-to-direction convention. That convention is pinned once, in
 * sky-environment-map.test.ts, where it is the subject rather than a means.
 */
const DISTINCT_DOME_RADIANCE = 3
const DISTINCT_SKY_AMBIENT: readonly number[] = NEUTRAL_DOME_SPHERICAL_HARMONICS.map(
  (coefficient) => coefficient * DISTINCT_DOME_RADIANCE,
)
/** Reconstruction and passthrough are exact copies; a loose float tolerance suffices. */
const PRECISION = 5
/** The sky scattering constants the module pins; they are the addon's own defaults today. */
const PINNED_SCATTERING = { turbidity: 2, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 }
/** Scattering constants unlike the pinned ones, standing in for a future addon default drift. */
const DRIFTED_SCATTERING = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.05,
  mieDirectionalG: 0.5,
}
const SKY_ADDON_PATH = 'three/examples/jsm/objects/SkyMesh.js'
/** The addon's export name, held as a value so a wrapped module can re-export under it. */
const SKY_ADDON_EXPORT = 'SkyMesh'

function makeLighting(): EnvironmentLighting {
  return {
    sunDirection: SUN_DIRECTION,
    sunColor: { r: 0.9, g: 0.8, b: 0.6 },
    skyColor: { r: 0.4, g: 0.55, b: 0.9 },
    sunLevel: 1.2,
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

/** Reads the map's first texel, in linear radiance. Any texel would do: the fixture dome
 *  above is uniform, so every one of them carries the same value. */
function firstTexelRadiance(texture: THREE.DataTexture): number {
  return THREE.DataUtils.fromHalfFloat((texture.image.data as Uint16Array)[0]!)
}

/**
 * Asserts the environment map carries makeLighting's sky ambient. The map replaced the
 * light probe as the carrier of the sky's ambient (ADR-0161), so this is where those
 * harmonics now have to land.
 */
function expectEnvironmentCarriesDistinctAmbient(rig: LightingRig): void {
  const texture = rig.environment
  expect(texture).toBeDefined()
  expect(firstTexelRadiance(texture!)).toBeCloseTo(DISTINCT_DOME_RADIANCE, 2)
}

/** Asserts the sky's sun aim and cloud coverage match makeLighting's distinct values. */
function expectSkyMatchesLighting(rig: LightingRig): void {
  const sunPosition = rig.sky?.sunPosition.value
  expect(sunPosition?.x).toBeCloseTo(SUN_DIRECTION.x, PRECISION)
  expect(sunPosition?.y).toBeCloseTo(SUN_DIRECTION.y, PRECISION)
  expect(sunPosition?.z).toBeCloseTo(SUN_DIRECTION.z, PRECISION)
  expect(rig.sky?.cloudCoverage.value).toBeCloseTo(CLOUD_COVER, PRECISION)
}

/** True when a uniform node holding exactly this object is reachable from the node. */
function reachesUniformHolding(
  root: { traverse: (cb: (node: object) => void) => void },
  held: object,
) {
  let reached = false
  root.traverse((node) => {
    const uniform = node as { isUniformNode?: boolean; value?: unknown }
    reached = reached || (uniform.isUniformNode === true && uniform.value === held)
  })
  return reached
}

/**
 * Attaches a sky whose addon constructor runs `drift` after the real one, the way a future
 * three release that changed its defaults would. The addon class is wrapped, never the
 * module under test, and the registry is restored so no other case sees the wrapper. A
 * rejection from the attach propagates, so a failing attach fails the case that asked for it.
 */
async function attachSkyFromWrappedAddon(
  drift: (sky: SkyMesh) => void,
): Promise<{ scene: THREE.Scene; rig: LightingRig }> {
  vi.resetModules()
  vi.doMock(SKY_ADDON_PATH, async () => {
    const actual = await vi.importActual<Record<string, new () => SkyMesh>>(SKY_ADDON_PATH)
    class WrappedSkyMesh extends (actual[SKY_ADDON_EXPORT]!) {
      constructor() {
        super()
        drift(this)
      }
    }
    return { ...actual, [SKY_ADDON_EXPORT]: WrappedSkyMesh }
  })
  try {
    const fresh = await import('./sky-environment')
    const applied = makeAppliedRig()
    await fresh.attachSkyEnvironment(applied.scene, applied.rig)
    return applied
  } finally {
    vi.doUnmock(SKY_ADDON_PATH)
    vi.resetModules()
  }
}

/** The addon leaves DRIFTED_SCATTERING behind instead of its own defaults. */
function driftScattering(sky: SkyMesh): void {
  sky.turbidity.value = DRIFTED_SCATTERING.turbidity
  sky.rayleigh.value = DRIFTED_SCATTERING.rayleigh
  sky.mieCoefficient.value = DRIFTED_SCATTERING.mieCoefficient
  sky.mieDirectionalG.value = DRIFTED_SCATTERING.mieDirectionalG
}

/** The addon builds no color node: it leaves `null` or `undefined` where a node used to be. */
function dropColorNode(colorNode: null | undefined): (sky: SkyMesh) => void {
  return (sky) => {
    sky.material.colorNode = colorNode as unknown as typeof sky.material.colorNode
  }
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

  it('pins the sky scattering constants rather than inheriting the addon defaults', async () => {
    const { rig } = await attachSkyFromWrappedAddon(driftScattering)

    // The addon's defaults equal these today, so a plain equality check would pass without
    // the module setting anything. The addon is wrapped to start from other values, so
    // only a module that writes the constants itself still reads them back here.
    expect(rig.sky?.turbidity.value).toBe(PINNED_SCATTERING.turbidity)
    expect(rig.sky?.rayleigh.value).toBe(PINNED_SCATTERING.rayleigh)
    expect(rig.sky?.mieCoefficient.value).toBe(PINNED_SCATTERING.mieCoefficient)
    expect(rig.sky?.mieDirectionalG.value).toBe(PINNED_SCATTERING.mieDirectionalG)
  })

  it('records the sky mesh gain scaled by the white point on the rig', async () => {
    const { scene, rig } = makeAppliedRig()

    await attachSkyEnvironment(scene, rig)

    expect(rig.skyGain).toBeInstanceOf(THREE.Vector3)
    expect(rig.skyGain?.x).toBeCloseTo(skyMeshGain().x, PRECISION)
    expect(rig.skyGain?.y).toBeCloseTo(skyMeshGain().y, PRECISION)
    expect(rig.skyGain?.z).toBeCloseTo(skyMeshGain().z, PRECISION)
  })

  it('multiplies the sky color by a uniform that reads the rig sky gain', async () => {
    const { SkyMesh: PristineSkyMesh } = await import(SKY_ADDON_PATH)
    const { scene, rig } = makeAppliedRig()

    await attachSkyEnvironment(scene, rig)

    // A later write to rig.skyGain has to reach the shader, so the node graph must hold
    // a uniform over that very vector, not a copy. A pristine addon sky holds none.
    expect(rig.skyGain).toBeDefined()
    expect(reachesUniformHolding(rig.sky!.material.colorNode!, rig.skyGain!)).toBe(true)
    expect(reachesUniformHolding(new PristineSkyMesh().material.colorNode, rig.skyGain!)).toBe(
      false,
    )
  })

  it.each([[null], [undefined]])(
    'resolves with the sky attached and no sky gain when the addon color node is %s',
    async (colorNode) => {
      const { scene, rig } = await attachSkyFromWrappedAddon(dropColorNode(colorNode))

      // The promise never rejects: with no color node there is nothing to multiply, so the
      // visible sky stays as the addon built it and the rig records no gain, since a gain
      // is held only when the sky reads it.
      expect(sceneHasSkyMesh(scene)).toBe(true)
      expect(rig.skyGain).toBeUndefined()
      expect(rig.sky?.material.colorNode).toBe(colorNode)
    },
  )

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

describe('skyMeshGain', () => {
  it('divides the sky mesh gain by each channel of the daylight white point', () => {
    const { r, g, b } = DAYLIGHT_CALIBRATION.whitePoint

    expect(Number.isFinite(SKY_MESH_GAIN)).toBe(true)
    expect(SKY_MESH_GAIN).toBeGreaterThan(0)
    expect(skyMeshGain().x).toBeCloseTo(SKY_MESH_GAIN / r, PRECISION)
    expect(skyMeshGain().y).toBeCloseTo(SKY_MESH_GAIN / g, PRECISION)
    expect(skyMeshGain().z).toBeCloseTo(SKY_MESH_GAIN / b, PRECISION)
  })

  it('returns a new vector on every call so a caller cannot alias another', () => {
    const first = skyMeshGain()

    first.set(0, 0, 0)

    expect(skyMeshGain()).not.toBe(first)
    expect(skyMeshGain().x).toBeGreaterThan(0)
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

  it('leaves the map alone when an update carries an unchanged sky ambient', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    updateSkyEnvironment(rig, makeLighting())
    const versionAfterFirstWrite = rig.environment!.pmremVersion

    // A fresh array holding the same coefficients: the sky has not moved, so the
    // comparison has to be on values rather than array identity.
    updateSkyEnvironment(rig, { ...makeLighting(), skyAmbient: [...DISTINCT_SKY_AMBIENT] })

    // Rewriting would re-run the PMREM filter chain on the GPU for a sky that did not
    // change. Updates arrive for reasons other than the sky (a bounds refit, a colour
    // change, a re-render), so the map regenerates on sky state, not on update count.
    expect(rig.environment!.pmremVersion).toBe(versionAfterFirstWrite)
  })

  it('regenerates the map when the sky ambient changes', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    updateSkyEnvironment(rig, makeLighting())
    const versionAfterFirstWrite = rig.environment!.pmremVersion

    // Time of day and cloud cover both reach the rig as a different sky ambient, which
    // is the one input the map is built from, so it is the whole invalidation signal.
    const duskAmbient = DISTINCT_SKY_AMBIENT.map((coefficient) => coefficient / 2)
    updateSkyEnvironment(rig, { ...makeLighting(), skyAmbient: duskAmbient })

    expect(rig.environment!.pmremVersion).toBeGreaterThan(versionAfterFirstWrite)
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

  it('disposes the environment map and clears it off the scene', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    updateSkyEnvironment(rig, makeLighting())
    const environment = rig.environment!
    const environmentDispose = vi.spyOn(environment, 'dispose')

    disposeLightingRig(scene, rig)

    // Three keys its filtered PMREM target off this source texture, and the node
    // renderer never listens for the source's dispose, so the source has to be freed
    // here and the scene has to stop pointing at a texture that is gone (ADR-0161).
    expect(environmentDispose).toHaveBeenCalled()
    expect(scene.environment).toBeNull()
    expect(rig.environment).toBeUndefined()
  })

  it('forgets the ambient it held so a rebuilt rig regenerates its map', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    updateSkyEnvironment(rig, makeLighting())

    disposeLightingRig(scene, rig)

    // A stale ambient surviving teardown would make the next rig's first update think
    // its fresh, still-black map already held the right sky and skip the first write.
    expect(rig.environmentAmbient).toBeUndefined()
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

  it('still tears down a rig that has no sky or environment map', () => {
    const scene = new THREE.Scene()
    const rig = buildLightingRig(scene, RIG_SUN_INTENSITY)

    expect(() => disposeLightingRig(scene, rig)).not.toThrow()

    expect(scene.children).not.toContain(rig.sun)
    expect(scene.children).not.toContain(rig.fill)
  })
})

describe('engine public surface', () => {
  it('keeps the sky mesh gain inside the lighting module, off the engine barrel', async () => {
    const engine = await import('../index')

    expect(engine).not.toHaveProperty('SKY_MESH_GAIN')
  })
})

describe('sky-environment module imports', () => {
  // This is a source-reading guard, not a behavior test. It pins a *bundling* property no
  // runtime assertion can observe: this module must not STATICALLY import the SkyMesh addon,
  // three/webgpu, or three/tsl. Any of them drags the whole WebGPU node-material system onto
  // the app's startup path. When this module statically imported the SkyMesh addon (which itself
  // statically imports three/webgpu), the app's entry chunk grew from ~2.0MB to ~2.6MB (the
  // deliberately lazy three.webgpu chunk folded into the entry), and cold startup slowed
  // enough to make e2e/tests/environment-panel.spec.ts flaky on firefox under parallel load.
  // The sky mesh must load lazily at attach time. See engine/testing/import-guards.ts for how
  // the static-vs-type-vs-dynamic import distinction is made; that helper is shared with the
  // equivalent ambient-occlusion.test.ts guard.
  it('never puts the SkyMesh addon, three/webgpu, or three/tsl on the startup path via a static import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/lighting/sky-environment.ts'),
      'utf8',
    )

    expect(importsStaticValueOf(source, 'three/examples/jsm/objects/SkyMesh.js')).toBe(false)
    expect(importsStaticValueOf(source, 'three/webgpu')).toBe(false)
    expect(importsStaticValueOf(source, 'three/tsl')).toBe(false)
  })
})
