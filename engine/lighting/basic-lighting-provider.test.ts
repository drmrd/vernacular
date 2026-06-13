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
