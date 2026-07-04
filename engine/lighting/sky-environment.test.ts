import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { SH_COEFFICIENT_COUNT, type EnvironmentLighting } from '../../core'
import { attachSkyEnvironment, updateSkyEnvironment } from './sky-environment'
import { buildLightingRig, disposeLightingRig, type LightingRig } from './lighting-rig'

/** The sun intensity the rig is built with; any positive value is fine for these tests. */
const RIG_SUN_INTENSITY = 1.6
/** A recognizable non-neutral sun aim with distinct components, so a copy is unambiguous. */
const SUN_DIRECTION = { x: 0.3, y: 0.8, z: -0.5 }
/** A cloud fraction distinct from the SkyMesh addon default (0.4), so a passthrough shows. */
const CLOUD_COVER = 0.72
/**
 * Twenty-seven distinct spherical-harmonic coefficients, one per flat index, so a
 * round-trip through the probe pins the SphericalHarmonics3.fromArray layout exactly:
 * coefficient `i` reads (array[3i], array[3i+1], array[3i+2]) into (x, y, z).
 */
const DISTINCT_SKY_AMBIENT: readonly number[] = Array.from(
  { length: SH_COEFFICIENT_COUNT },
  (_, index) => (index + 1) / 10,
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

/** Asserts the probe carries makeLighting's distinct sky-ambient harmonics in fromArray order. */
function expectProbeCarriesDistinctAmbient(rig: LightingRig): void {
  const coefficients = rig.probe?.sh.coefficients
  expect(coefficients?.[0]?.x).toBeCloseTo(DISTINCT_SKY_AMBIENT[0]!, PRECISION)
  expect(coefficients?.[8]?.z).toBeCloseTo(DISTINCT_SKY_AMBIENT[26]!, PRECISION)
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
  it('records the probe and zeroes the fill synchronously, before the sky finishes loading', () => {
    const { scene, rig } = makeAppliedRig()
    expect(rig.fill.intensity).toBeGreaterThan(0)

    attachSkyEnvironment(scene, rig)

    // The probe attaches and the fill is zeroed synchronously so the scene is never
    // momentarily unlit; the visible sky mesh may still be loading (asserted below).
    expect(rig.probe).toBeInstanceOf(THREE.LightProbe)
    expect(scene.children).toContain(rig.probe)
    expect(rig.fill.intensity).toBe(0)
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

    // The probe exists synchronously, so the ambient lands immediately even while the
    // sky is still loading: the harmonics round-trip through the probe right away.
    expectProbeCarriesDistinctAmbient(rig)

    await attached

    // The update ran before the sky was attached, so attach must stash the latest
    // lighting and replay it: the resolved sky carries that same sun aim and clouds.
    expectSkyMatchesLighting(rig)
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

  it("loads the lighting's sky-ambient harmonics into the probe in fromArray order", async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    const coefficients = rig.probe?.sh.coefficients
    expect(coefficients?.[0]?.x).toBeCloseTo(DISTINCT_SKY_AMBIENT[0]!, PRECISION)
    expect(coefficients?.[1]?.y).toBeCloseTo(DISTINCT_SKY_AMBIENT[4]!, PRECISION)
    expect(coefficients?.[8]?.z).toBeCloseTo(DISTINCT_SKY_AMBIENT[26]!, PRECISION)
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

  it('removes and disposes the sky and probe when the rig owns them', async () => {
    const { scene, rig } = makeAppliedRig()
    await attachSkyEnvironment(scene, rig)
    const sky = rig.sky!
    const probe = rig.probe!
    const geometryDispose = vi.spyOn(sky.geometry, 'dispose')
    const materialDispose = vi.spyOn(sky.material, 'dispose')
    const probeDispose = vi.spyOn(probe, 'dispose')

    disposeLightingRig(scene, rig)

    expect(scene.children).not.toContain(sky)
    expect(scene.children).not.toContain(probe)
    expect(geometryDispose).toHaveBeenCalled()
    expect(materialDispose).toHaveBeenCalled()
    expect(probeDispose).toHaveBeenCalled()
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
  // The sky mesh must load lazily at attach time. `import type` is erased at compile time and
  // a dynamic `import(...)` is the allowed lazy boundary, so neither of those counts here.
  const importsStaticValueOf = (source: string, specifier: string): boolean => {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A static value import always reaches a `from '<specifier>'` and is not `import type`;
    // a dynamic `import(...)` has no `from`, so requiring `from` excludes the lazy boundary.
    const staticValueImport = new RegExp(
      String.raw`import\s+(?!type\b)[\s\S]*?from\s*['"]${escaped}['"]`,
    )
    const bareSideEffectImport = new RegExp(String.raw`import\s+['"]${escaped}['"]`)
    return staticValueImport.test(source) || bareSideEffectImport.test(source)
  }

  it('never puts the SkyMesh addon or three/webgpu on the startup path via a static import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/lighting/sky-environment.ts'),
      'utf8',
    )

    expect(importsStaticValueOf(source, 'three/examples/jsm/objects/SkyMesh.js')).toBe(false)
    expect(importsStaticValueOf(source, 'three/webgpu')).toBe(false)
  })
})
