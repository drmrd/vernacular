import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BasicLightingProvider } from './basic-lighting-provider'
import {
  buildLightingRig,
  setLightingColor,
  fitSunShadowToBounds,
  fitSunShadowToDirection,
  setSunAndSkyColor,
} from './lighting-rig'

/** A shell roughly 4 m by 3 m in plan and 2.6 m tall, in the project's millimeter world. */
const SHELL_BOUNDS = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }
/** Half the bounding-box diagonal: the radius the shadow fitter derives its frustum from. */
const SHELL_RADIUS = Math.hypot(4000, 2600, 3000) / 2

/** Casting is spelled out because the schematic provider opts out of it (ADR-0153). */
function castingSun(scene: THREE.Scene): THREE.DirectionalLight {
  return buildLightingRig(scene, 1, true).sun
}

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

describe('sun shadow acne calibration', () => {
  // `shadow.bias` is an offset in the normalized [0, 1] light-space depth; `shadow.normalBias`
  // is a world offset in millimeters. Both are read back here against the texel size measured
  // off the fitted camera, so the assertions never restate the implementation's own arithmetic.
  const texelDiagonal = (sun: THREE.DirectionalLight): number => {
    const camera = sun.shadow.camera
    return (Math.SQRT2 * (camera.right - camera.left)) / sun.shadow.mapSize.x
  }
  const worldDepthBias = (sun: THREE.DirectionalLight): number =>
    -sun.shadow.bias * (sun.shadow.camera.far - sun.shadow.camera.near)

  it('fits a shadow camera whose depth range equals its lateral extent', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    const camera = sun.shadow.camera
    const precision = 6
    expect(camera.far - camera.near).toBeCloseTo(camera.right - camera.left, precision)
    expect(camera.far - camera.near).toBeCloseTo(SHELL_RADIUS * 2, precision)
  })

  it('biases depth by one shadow-map texel diagonal, expressed in normalized depth', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    const precision = 6
    expect(worldDepthBias(sun)).toBeCloseTo(texelDiagonal(sun), precision)
    expect(sun.shadow.bias).toBeLessThan(0)
  })

  it('keeps the normalized depth bias independent of scene size', () => {
    const smallScene = new THREE.Scene()
    const smallSun = castingSun(smallScene)
    const largeScene = new THREE.Scene()
    const largeSun = castingSun(largeScene)

    fitSunShadowToBounds(smallScene, SHELL_BOUNDS)
    fitSunShadowToBounds(largeScene, {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 40000, y: 9000, z: 30000 },
    })

    // The bias is normalized depth, and the fitted camera's depth range grows with the scene
    // exactly as its texel does, so the same number stays right at both sizes.
    const precision = 6
    expect(largeSun.shadow.bias).toBeCloseTo(smallSun.shadow.bias, precision)
    // The one unchanged number still buys exactly one texel diagonal of depth at a scene an
    // order of magnitude larger, where that diagonal is a very different world length.
    expect(worldDepthBias(largeSun)).toBeCloseTo(texelDiagonal(largeSun), precision)
    expect(texelDiagonal(largeSun)).toBeGreaterThan(texelDiagonal(smallSun) * 2)
  })

  it('offsets shadow sampling along the surface normal by one texel diagonal', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    const texel = texelDiagonal(sun) / Math.SQRT2
    const precision = 6
    expect(sun.shadow.normalBias).toBeCloseTo(texelDiagonal(sun), precision)
    // Within a small factor of the texel size: enough to clear the sampled texel, small
    // enough that the shadow stays visually attached to its caster.
    expect(sun.shadow.normalBias / texel).toBeGreaterThan(1)
    expect(sun.shadow.normalBias / texel).toBeLessThan(2)
  })

  it('scales the world-space normal offset with the fitted scene', () => {
    const smallScene = new THREE.Scene()
    const smallSun = castingSun(smallScene)
    const largeScene = new THREE.Scene()
    const largeSun = castingSun(largeScene)

    fitSunShadowToBounds(smallScene, SHELL_BOUNDS)
    fitSunShadowToBounds(largeScene, {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 8000, y: 5200, z: 6000 },
    })

    const precision = 6
    expect(largeSun.shadow.normalBias).toBeCloseTo(smallSun.shadow.normalBias * 2, precision)
  })

  it('clears the worst-case texel depth error at every surface orientation', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToDirection(scene, { x: 1, y: 2, z: 0.35 }, SHELL_BOUNDS)

    // A lateral separation of one texel diagonal is worth `diagonal * sin(theta)` of depth error
    // at angle theta between the surface normal and the light, while the normal offset buys back
    // `normalBias * cos(theta)` and the depth bias buys back its own world depth outright. Acne
    // is impossible only where the second pair covers the first, at every theta rather than the
    // shallow ones a constant bias alone reaches.
    const diagonal = texelDiagonal(sun)
    const worldBias = worldDepthBias(sun)
    const steps = 90
    for (let step = 0; step <= steps; step += 1) {
      const theta = (step / steps) * (Math.PI / 2)
      const compensation = sun.shadow.normalBias * Math.cos(theta) + worldBias
      expect(compensation).toBeGreaterThanOrEqual(diagonal * Math.sin(theta))
    }
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
