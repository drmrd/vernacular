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
  // The fitter's orthographic shadow camera spans 2 * radius laterally and, because it stands
  // the sun off at 3 * radius, also 2 * radius in depth. One shadow-map texel therefore covers
  // the same world length laterally and in depth, and the texel's world size is the scale every
  // constant below is derived from. `shadow.bias` is a normalized-depth offset (three adds it to
  // the light-space z in [0, 1]); `shadow.normalBias` is a world-space offset in millimeters.
  const texelWorldSize = (camera: THREE.OrthographicCamera, mapSizeX: number): number =>
    (camera.right - camera.left) / mapSizeX

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

    const camera = sun.shadow.camera
    const texel = texelWorldSize(camera, sun.shadow.mapSize.x)
    const worldBias = -sun.shadow.bias * (camera.far - camera.near)
    const precision = 6
    expect(worldBias).toBeCloseTo(Math.SQRT2 * texel, precision)
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

    const precision = 12
    expect(largeSun.shadow.bias).toBeCloseTo(smallSun.shadow.bias, precision)
    expect(smallSun.shadow.bias).toBeCloseTo(-Math.SQRT2 / smallSun.shadow.mapSize.x, precision)
  })

  it('offsets shadow sampling along the surface normal by one texel diagonal', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    const texel = texelWorldSize(sun.shadow.camera, sun.shadow.mapSize.x)
    const precision = 6
    expect(sun.shadow.normalBias).toBeCloseTo(Math.SQRT2 * texel, precision)
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

    // The depth a fragment is compared against belongs to a point on the same surface up to one
    // texel diagonal away laterally (half a texel from map quantization, the rest from the
    // PCFSoft neighborhood). At an angle theta between the surface normal and the light, that
    // lateral separation is worth `diagonal * sin(theta)` of depth error, while the normal
    // offset buys back `normalBias * cos(theta)` and the constant bias buys back its own world
    // depth outright. Acne is impossible only when the second pair covers the first everywhere.
    const camera = sun.shadow.camera
    const diagonal = Math.SQRT2 * texelWorldSize(camera, sun.shadow.mapSize.x)
    const worldBias = -sun.shadow.bias * (camera.far - camera.near)
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
