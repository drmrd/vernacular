import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BasicLightingProvider } from './basic-lighting-provider'

describe('BasicLightingProvider', () => {
  it('adds a directional sun and a hemisphere fill light to the scene', () => {
    const scene = new THREE.Scene()

    new BasicLightingProvider().apply(scene)

    const directional = scene.children.filter((child) => child instanceof THREE.DirectionalLight)
    const hemisphere = scene.children.filter((child) => child instanceof THREE.HemisphereLight)
    expect(directional).toHaveLength(1)
    expect(hemisphere).toHaveLength(1)
  })

  it('makes the rig key dominant: the sun is brighter than the hemisphere fill', () => {
    const scene = new THREE.Scene()

    new BasicLightingProvider().apply(scene)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const fill = scene.children.find(
      (child) => child instanceof THREE.HemisphereLight,
    ) as THREE.HemisphereLight
    // A key-dominant rig lets the sun set the value of the faces it reaches while the
    // fill only keeps the unlit faces off black, so faces at different angles separate
    // in value instead of washing flat under an equal fill (ADR-0079).
    expect(sun.intensity).toBeGreaterThan(fill.intensity)
  })

  it('aims the sun so two perpendicular walls receive different direct light', () => {
    const scene = new THREE.Scene()

    new BasicLightingProvider().apply(scene)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    // The direct light a vertical face receives is the Lambert term of the sun's
    // direction against the face normal. A symmetric azimuth (equal horizontal
    // components) lights the two perpendicular exterior walls equally, so they cannot
    // separate by value; an asymmetric azimuth gives them different direct light (ADR-0079).
    const direction = sun.position.clone().normalize()
    const litFacing = (normal: THREE.Vector3): number => Math.max(0, direction.dot(normal))
    const towardPlusX = litFacing(new THREE.Vector3(1, 0, 0))
    const towardPlusZ = litFacing(new THREE.Vector3(0, 0, 1))
    // The +X face receives ~0.44 and the +Z face ~0.15 of the normalized sun, so the
    // gap clears 0.1 comfortably; a symmetric azimuth would make it exactly 0.
    expect(Math.abs(towardPlusX - towardPlusZ)).toBeGreaterThan(0.1)
  })

  it('configures the directional sun to cast a shadow with a real shadow map', () => {
    const scene = new THREE.Scene()

    new BasicLightingProvider().apply(scene)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    expect(sun.castShadow).toBe(true)
    expect(sun.shadow.mapSize.width).toBeGreaterThan(0)
    expect(sun.shadow.mapSize.height).toBeGreaterThan(0)
  })
})
