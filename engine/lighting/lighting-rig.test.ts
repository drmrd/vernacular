import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BasicLightingProvider } from './basic-lighting-provider'
import {
  setLightingColor,
  removeLighting,
  fitSunShadowToBounds,
  fitSunShadowToDirection,
  setSunAndSkyColor,
} from './lighting-rig'

describe('setLightingColor', () => {
  it('tints the directional sun and the hemisphere sky to a linear color', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)

    setLightingColor(scene, { r: 1, g: 0.5, b: 0.25 })

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const hemisphere = scene.children.find(
      (child) => child instanceof THREE.HemisphereLight,
    ) as THREE.HemisphereLight
    const precision = 5
    expect(sun.color.r).toBeCloseTo(1, precision)
    expect(sun.color.g).toBeCloseTo(0.5, precision)
    expect(sun.color.b).toBeCloseTo(0.25, precision)
    expect(hemisphere.color.r).toBeCloseTo(1, precision)
    expect(hemisphere.color.g).toBeCloseTo(0.5, precision)
    expect(hemisphere.color.b).toBeCloseTo(0.25, precision)
  })
})

describe('removeLighting', () => {
  it('removes the lights an applied rig added, so a re-apply does not stack them', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)

    removeLighting(scene)

    expect(scene.children.some((child) => child instanceof THREE.DirectionalLight)).toBe(false)
    expect(scene.children.some((child) => child instanceof THREE.HemisphereLight)).toBe(false)
  })
})

describe('fitSunShadowToBounds', () => {
  it('sizes the sun shadow frustum to cover the scene bounds', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }

    fitSunShadowToBounds(scene, bounds)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const camera = sun.shadow.camera
    const radius = Math.hypot(4000, 2600, 3000) / 2
    expect(camera.right - camera.left).toBeGreaterThanOrEqual(radius * 2)
    expect(camera.top - camera.bottom).toBeGreaterThanOrEqual(radius * 2)
    expect(camera.far).toBeGreaterThanOrEqual(radius * 2)
  })

  it('leaves the sun untouched for null bounds', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const positionBefore = sun.position.clone()

    expect(() => fitSunShadowToBounds(scene, null)).not.toThrow()

    expect(sun.position.equals(positionBefore)).toBe(true)
  })
})

describe('fitSunShadowToDirection', () => {
  it('places the sun straight above the bounds center for an overhead direction', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }

    fitSunShadowToDirection(scene, { x: 0, y: 1, z: 0 }, bounds)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const radius = Math.hypot(4000, 2600, 3000) / 2
    const precision = 5
    expect(sun.position.x).toBeCloseTo(2000, precision)
    expect(sun.position.z).toBeCloseTo(1500, precision)
    expect(sun.position.y).toBeCloseTo(1300 + radius * 3, precision)
    expect(sun.target.position.x).toBeCloseTo(2000, precision)
    expect(sun.target.position.y).toBeCloseTo(1300, precision)
    expect(sun.target.position.z).toBeCloseTo(1500, precision)
    const camera = sun.shadow.camera
    expect(camera.right - camera.left).toBeGreaterThanOrEqual(radius * 2)
    expect(camera.far).toBeGreaterThanOrEqual(radius * 2)
  })

  it('places the sun beside the bounds center for a horizontal direction', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }

    fitSunShadowToDirection(scene, { x: 1, y: 0, z: 0 }, bounds)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const radius = Math.hypot(4000, 2600, 3000) / 2
    const precision = 5
    expect(sun.position.x).toBeCloseTo(2000 + radius * 3, precision)
    expect(sun.position.y).toBeCloseTo(1300, precision)
    expect(sun.position.z).toBeCloseTo(1500, precision)
  })

  it('leaves the sun untouched for null bounds', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const positionBefore = sun.position.clone()

    expect(() => fitSunShadowToDirection(scene, { x: 0, y: 1, z: 0 }, null)).not.toThrow()

    expect(sun.position.equals(positionBefore)).toBe(true)
  })
})

describe('setSunAndSkyColor', () => {
  it('colors the directional sun and the hemisphere sky independently', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)

    setSunAndSkyColor(scene, { r: 1, g: 0.5, b: 0.25 }, { r: 0.2, g: 0.4, b: 0.9 })

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const hemisphere = scene.children.find(
      (child) => child instanceof THREE.HemisphereLight,
    ) as THREE.HemisphereLight
    const precision = 5
    expect(sun.color.r).toBeCloseTo(1, precision)
    expect(sun.color.g).toBeCloseTo(0.5, precision)
    expect(sun.color.b).toBeCloseTo(0.25, precision)
    expect(hemisphere.color.r).toBeCloseTo(0.2, precision)
    expect(hemisphere.color.g).toBeCloseTo(0.4, precision)
    expect(hemisphere.color.b).toBeCloseTo(0.9, precision)
    expect(sun.color.equals(hemisphere.color)).toBe(false)
  })
})
