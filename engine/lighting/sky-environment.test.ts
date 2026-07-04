import { describe, it, expect, vi } from 'vitest'
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

describe('attachSkyEnvironment', () => {
  it('adds the visible sky and a light probe to the scene and records both on the rig', () => {
    const { scene, rig } = makeAppliedRig()

    attachSkyEnvironment(scene, rig)

    expect(rig.sky?.isSkyMesh).toBe(true)
    expect(scene.children).toContain(rig.sky)
    expect(rig.probe).toBeInstanceOf(THREE.LightProbe)
    expect(scene.children).toContain(rig.probe)
  })

  it('zeroes the hemisphere fill so the probe alone carries the sky ambient', () => {
    const { scene, rig } = makeAppliedRig()
    expect(rig.fill.intensity).toBeGreaterThan(0)

    attachSkyEnvironment(scene, rig)

    expect(rig.fill.intensity).toBe(0)
  })

  it('freezes cloud motion and keeps the sun disc visible for deterministic baselines', () => {
    const { scene, rig } = makeAppliedRig()

    attachSkyEnvironment(scene, rig)

    expect(rig.sky?.cloudSpeed.value).toBe(0)
    expect(rig.sky?.showSunDisc.value).toBe(1)
  })
})

describe('updateSkyEnvironment', () => {
  it("aims the sky's sun position at the lighting's sun direction", () => {
    const { scene, rig } = makeAppliedRig()
    attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    const sunPosition = rig.sky?.sunPosition.value
    expect(sunPosition?.x).toBeCloseTo(SUN_DIRECTION.x, PRECISION)
    expect(sunPosition?.y).toBeCloseTo(SUN_DIRECTION.y, PRECISION)
    expect(sunPosition?.z).toBeCloseTo(SUN_DIRECTION.z, PRECISION)
  })

  it("drives the sky's cloud coverage from the lighting's cloud cover", () => {
    const { scene, rig } = makeAppliedRig()
    attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    expect(rig.sky?.cloudCoverage.value).toBeCloseTo(CLOUD_COVER, PRECISION)
  })

  it("loads the lighting's sky-ambient harmonics into the probe in fromArray order", () => {
    const { scene, rig } = makeAppliedRig()
    attachSkyEnvironment(scene, rig)

    updateSkyEnvironment(rig, makeLighting())

    const coefficients = rig.probe?.sh.coefficients
    expect(coefficients?.[0]?.x).toBeCloseTo(DISTINCT_SKY_AMBIENT[0]!, PRECISION)
    expect(coefficients?.[1]?.y).toBeCloseTo(DISTINCT_SKY_AMBIENT[4]!, PRECISION)
    expect(coefficients?.[8]?.z).toBeCloseTo(DISTINCT_SKY_AMBIENT[26]!, PRECISION)
  })
})

describe('disposeLightingRig', () => {
  it('removes and disposes the sky and probe when the rig owns them', () => {
    const { scene, rig } = makeAppliedRig()
    attachSkyEnvironment(scene, rig)
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
