import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js'
import {
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  SH_COEFFICIENT_COUNT,
  type Bounds3,
  type EnvironmentLighting,
} from '../../core'
import { SolarLightingProvider } from './solar-lighting-provider'
import { DAYLIGHT_SUN_INTENSITY } from './lighting-rig'

// Fabricated environments: a deliberately loud warm sun under a cool sky. The
// solar math that would produce real values is core-tested; here we only care
// that the rig faithfully applies whatever environment it is handed.
const fabricatedCloudCover = 0.3
const overheadSunLighting: EnvironmentLighting = {
  sunDirection: { x: 0, y: 1, z: 0 },
  sunColor: { r: 1, g: 0.5, b: 0.25 },
  skyColor: { r: 0.2, g: 0.4, b: 0.9 },
  sunIntensity: 1,
  cloudCover: fabricatedCloudCover,
  skyAmbient: NEUTRAL_DOME_SPHERICAL_HARMONICS,
}
const duskSunLighting: EnvironmentLighting = { ...overheadSunLighting, sunIntensity: 0.5 }
const sunDownLighting: EnvironmentLighting = { ...overheadSunLighting, sunIntensity: 0 }

// A sky-lit environment with an off-axis sun and a distinct value at every
// spherical-harmonic index, so the probe round-trip pins the fromArray layout:
// coefficient i reads (array[3i], array[3i+1], array[3i+2]) into (x, y, z).
const skyLitSunDirection = { x: 0.3, y: 0.8, z: -0.5 }
const distinctSkyAmbient: readonly number[] = Array.from(
  { length: SH_COEFFICIENT_COUNT },
  (_, index) => (index + 1) / 10,
)
const skyLitLighting: EnvironmentLighting = {
  ...overheadSunLighting,
  sunDirection: skyLitSunDirection,
  skyAmbient: distinctSkyAmbient,
}

const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }
const boundsRadius = Math.hypot(4000, 2600, 3000) / 2

const findSun = (scene: THREE.Object3D): THREE.DirectionalLight =>
  scene.children.find((child) => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight

const findSky = (scene: THREE.Object3D): THREE.HemisphereLight =>
  scene.children.find((child) => child instanceof THREE.HemisphereLight) as THREE.HemisphereLight

const findSkyMesh = (scene: THREE.Object3D): SkyMesh | undefined =>
  scene.children.find((child): child is SkyMesh => child instanceof SkyMesh)

const findProbe = (scene: THREE.Object3D): THREE.LightProbe | undefined =>
  scene.children.find((child): child is THREE.LightProbe => child instanceof THREE.LightProbe)

describe('SolarLightingProvider', () => {
  it('adds a shadow-casting directional sun and a hemisphere sky to the scene', () => {
    const scene = new THREE.Scene()

    new SolarLightingProvider().apply(scene)

    const directional = scene.children.filter((child) => child instanceof THREE.DirectionalLight)
    const hemisphere = scene.children.filter((child) => child instanceof THREE.HemisphereLight)
    expect(directional).toHaveLength(1)
    expect(hemisphere).toHaveLength(1)
    expect((directional[0] as THREE.DirectionalLight).castShadow).toBe(true)
  })

  it('lights the scene from a visible sky mesh and a probe, zeroing the hemisphere fill', async () => {
    const scene = new THREE.Scene()

    new SolarLightingProvider().apply(scene)

    // Realistic mode is lit by its own visible sky: the sky mesh is the far-field
    // background and the probe carries the diffuse ambient, so the flat hemisphere fill
    // is zeroed (running both would double-count the sky ambient; locked decision 2).
    // The probe and the zeroed fill land synchronously; the visible sky mesh loads lazily
    // off the startup path (dynamic import), so poll for it to appear.
    expect(findProbe(scene)).toBeInstanceOf(THREE.LightProbe)
    expect(findSky(scene).intensity).toBe(0)
    await vi.waitFor(() => {
      expect(findSkyMesh(scene)?.isSkyMesh).toBe(true)
    })
  })

  it('aims the sun along the environment direction and applies the sun and sky colors', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)

    provider.update(scene, overheadSunLighting, bounds)

    const sun = findSun(scene)
    const sky = findSky(scene)
    const precision = 5
    // An overhead direction places the sun straight above the bounds center,
    // at the shadow-fit distance of three radii.
    expect(sun.position.x).toBeCloseTo(2000, precision)
    expect(sun.position.y).toBeCloseTo(1300 + boundsRadius * 3, precision)
    expect(sun.position.z).toBeCloseTo(1500, precision)
    expect(sun.color.r).toBeCloseTo(1, precision)
    expect(sun.color.g).toBeCloseTo(0.5, precision)
    expect(sun.color.b).toBeCloseTo(0.25, precision)
    expect(sky.color.r).toBeCloseTo(0.2, precision)
    expect(sky.color.g).toBeCloseTo(0.4, precision)
    expect(sky.color.b).toBeCloseTo(0.9, precision)
    expect(sun.intensity).toBeCloseTo(DAYLIGHT_SUN_INTENSITY, precision)
  })

  it('scales the sun intensity by the environment sunIntensity fraction', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)

    provider.update(scene, duskSunLighting, bounds)

    const precision = 5
    expect(findSun(scene).intensity).toBeCloseTo(DAYLIGHT_SUN_INTENSITY * 0.5, precision)
  })

  it("aims the sky's sun position at the environment sun direction", async () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)
    // The sky mesh loads lazily; wait for it before driving it from an update.
    await vi.waitFor(() => expect(findSkyMesh(scene)).toBeDefined())

    provider.update(scene, skyLitLighting, bounds)

    const precision = 5
    const sunPosition = findSkyMesh(scene)?.sunPosition.value
    expect(sunPosition?.x).toBeCloseTo(skyLitSunDirection.x, precision)
    expect(sunPosition?.y).toBeCloseTo(skyLitSunDirection.y, precision)
    expect(sunPosition?.z).toBeCloseTo(skyLitSunDirection.z, precision)
  })

  it('loads the environment sky-ambient harmonics into the probe in fromArray order', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)

    provider.update(scene, skyLitLighting, bounds)

    const precision = 5
    const coefficients = findProbe(scene)?.sh.coefficients
    expect(coefficients?.[0]?.x).toBeCloseTo(distinctSkyAmbient[0]!, precision)
    expect(coefficients?.[8]?.z).toBeCloseTo(distinctSkyAmbient[26]!, precision)
  })

  it('dims the direct sun to near zero when the sun is down, keeping the probe ambient lit', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)

    provider.update(scene, sunDownLighting, bounds)

    // At night or in twilight the direct sun contributes nothing, but the sky's light
    // probe still carries the diffuse ambient so the scene does not go black (the probe
    // replaces the old hemisphere fill as the ambient source in realistic mode).
    expect(findSun(scene).intensity).toBeLessThan(0.01)
    expect(findProbe(scene)?.sh.coefficients[0]?.length()).toBeGreaterThan(0)
  })

  it('applies colors but leaves the sun unmoved when the scene bounds are null', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)
    const sun = findSun(scene)
    const positionBefore = sun.position.clone()

    expect(() => provider.update(scene, overheadSunLighting, null)).not.toThrow()

    expect(sun.position.equals(positionBefore)).toBe(true)
    const precision = 5
    expect(sun.color.r).toBeCloseTo(1, precision)
    expect(sun.color.g).toBeCloseTo(0.5, precision)
    expect(sun.color.b).toBeCloseTo(0.25, precision)
    expect(findSky(scene).color.b).toBeCloseTo(0.9, precision)
  })

  it('leaves no sky, probe, or lights in the scene after dispose', async () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)
    // Let the lazily loaded sky finish attaching, then confirm dispose clears it too.
    await vi.waitFor(() => expect(findSkyMesh(scene)).toBeDefined())

    provider.dispose(scene)

    expect(findSkyMesh(scene)).toBeUndefined()
    expect(findProbe(scene)).toBeUndefined()
    expect(scene.children.filter((child) => child instanceof THREE.Light)).toHaveLength(0)
  })

  it('tolerates an update before apply on an empty scene without throwing', () => {
    const scene = new THREE.Scene()

    expect(() => new SolarLightingProvider().update(scene, overheadSunLighting, null)).not.toThrow()
  })
})
