import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import type { LightingProvider } from './lighting-provider'
import { BasicLightingProvider } from './basic-lighting-provider'
import { SolarLightingProvider } from './solar-lighting-provider'

const findSun = (scene: THREE.Object3D): THREE.DirectionalLight =>
  scene.children.find((child) => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight

const countDirectional = (scene: THREE.Object3D): number =>
  scene.children.filter((child) => child instanceof THREE.DirectionalLight).length

const countHemisphere = (scene: THREE.Object3D): number =>
  scene.children.filter((child) => child instanceof THREE.HemisphereLight).length

const providers: ReadonlyArray<[string, () => LightingProvider]> = [
  ['BasicLightingProvider', () => new BasicLightingProvider()],
  ['SolarLightingProvider', () => new SolarLightingProvider()],
]

// Teardown belongs to the provider that built the rig: swapping providers must
// not leave lights behind or leak the sun's shadow-map texture (issue #434).
describe.each(providers)('%s disposal', (_providerName, createProvider) => {
  it('removes the directional sun and the hemisphere light it applied', () => {
    const scene = new THREE.Scene()
    const provider = createProvider()
    provider.apply(scene)

    provider.dispose(scene)

    expect(countDirectional(scene)).toBe(0)
    expect(countHemisphere(scene)).toBe(0)
  })

  it('disposes the directional sun, releasing its shadow-map GPU resources', () => {
    const scene = new THREE.Scene()
    const provider = createProvider()
    provider.apply(scene)
    const sun = findSun(scene)
    const disposeSpy = vi.spyOn(sun, 'dispose')

    provider.dispose(scene)

    expect(disposeSpy).toHaveBeenCalled()
  })

  it('leaves exactly one sun and one hemisphere light after a dispose-then-apply swap', () => {
    const scene = new THREE.Scene()
    const provider = createProvider()
    provider.apply(scene)

    provider.dispose(scene)
    provider.apply(scene)

    expect(countDirectional(scene)).toBe(1)
    expect(countHemisphere(scene)).toBe(1)
  })
})
