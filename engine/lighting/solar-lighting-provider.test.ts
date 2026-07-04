import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  type Bounds3,
  type EnvironmentLighting,
} from '../../core'
import { SolarLightingProvider } from './solar-lighting-provider'
import { DAYLIGHT_SUN_INTENSITY } from './lighting-rig'

// Fabricated environments: a deliberately loud warm sun under a cool sky. The
// solar math that would produce real values is core-tested; here we only care
// that the rig faithfully applies whatever environment it is handed.
const FABRICATED_CLOUD_COVER = 0.3
const overheadSunLighting: EnvironmentLighting = {
  sunDirection: { x: 0, y: 1, z: 0 },
  sunColor: { r: 1, g: 0.5, b: 0.25 },
  skyColor: { r: 0.2, g: 0.4, b: 0.9 },
  sunIntensity: 1,
  cloudCover: FABRICATED_CLOUD_COVER,
  skyAmbient: NEUTRAL_DOME_SPHERICAL_HARMONICS,
}
const duskSunLighting: EnvironmentLighting = { ...overheadSunLighting, sunIntensity: 0.5 }
const sunDownLighting: EnvironmentLighting = { ...overheadSunLighting, sunIntensity: 0 }

const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }
const boundsRadius = Math.hypot(4000, 2600, 3000) / 2

const findSun = (scene: THREE.Object3D): THREE.DirectionalLight =>
  scene.children.find((child) => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight

const findSky = (scene: THREE.Object3D): THREE.HemisphereLight =>
  scene.children.find((child) => child instanceof THREE.HemisphereLight) as THREE.HemisphereLight

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

  it('dims the direct sun to near zero when the sun is down, keeping the sky lit', () => {
    const scene = new THREE.Scene()
    const provider = new SolarLightingProvider()
    provider.apply(scene)

    provider.update(scene, sunDownLighting, bounds)

    // At night or in twilight the direct sun contributes nothing, but the
    // ambient sky still lights the scene so it does not go black.
    expect(findSun(scene).intensity).toBeLessThan(0.01)
    expect(findSky(scene).intensity).toBeGreaterThan(0)
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

  it('tolerates an update before apply on an empty scene without throwing', () => {
    const scene = new THREE.Scene()

    expect(() => new SolarLightingProvider().update(scene, overheadSunLighting, null)).not.toThrow()
  })
})
