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

/** Millimeter-scale quantities compared against a derivation, so six decimals is ample. */
const LENGTH_PRECISION = 6
/** Angles in radians, where six decimals is finer than a thousandth of a degree. */
const ANGLE_PRECISION = 6
/** Enough halvings to pin a coverage angle far finer than the assertions read it. */
const BISECTION_STEPS = 60

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

  // The shadow map quantizes position in the light's image plane, the plane perpendicular to the
  // light direction, not along the receiving surface. A displacement of `s` in that plane lands
  // on a surface point `s * tan(theta)` further away in depth for a surface at angle theta to the
  // light, which is unbounded as theta approaches grazing. Hence a coverage limit rather than
  // blanket coverage.
  const depthErrorAt = (sun: THREE.DirectionalLight, theta: number): number =>
    texelDiagonal(sun) * Math.tan(theta)
  const compensationAt = (
    sun: THREE.DirectionalLight,
    theta: number,
    normalOffset = sun.shadow.normalBias,
  ): number => normalOffset * Math.cos(theta) + worldDepthBias(sun)

  // The steepest surface the given normal offset still holds off its own shadow. The margin
  // shrinks monotonically in theta, so a bisection finds the crossing.
  const coverageLimitRadians = (sun: THREE.DirectionalLight, normalOffset: number): number => {
    let covered = 0
    let uncovered = Math.PI / 2 - Number.EPSILON
    for (let iteration = 0; iteration < BISECTION_STEPS; iteration += 1) {
      const midpoint = (covered + uncovered) / 2
      const holds = compensationAt(sun, midpoint, normalOffset) >= depthErrorAt(sun, midpoint)
      if (holds) covered = midpoint
      else uncovered = midpoint
    }
    return covered
  }

  it('fits a shadow camera whose depth range equals its lateral extent', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    const camera = sun.shadow.camera
    expect(camera.far - camera.near).toBeCloseTo(camera.right - camera.left, LENGTH_PRECISION)
    expect(camera.far - camera.near).toBeCloseTo(SHELL_RADIUS * 2, LENGTH_PRECISION)
  })

  it('biases depth by one shadow-map texel diagonal, expressed in normalized depth', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    expect(worldDepthBias(sun)).toBeCloseTo(texelDiagonal(sun), LENGTH_PRECISION)
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
    expect(largeSun.shadow.bias).toBeCloseTo(smallSun.shadow.bias, LENGTH_PRECISION)
    // The one unchanged number still buys exactly one texel diagonal of depth at a scene an
    // order of magnitude larger, where that diagonal is a very different world length.
    expect(worldDepthBias(largeSun)).toBeCloseTo(texelDiagonal(largeSun), LENGTH_PRECISION)
    expect(texelDiagonal(largeSun)).toBeGreaterThan(texelDiagonal(smallSun) * 2)
  })

  it('offsets shadow sampling along the surface normal by one texel diagonal', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    expect(sun.shadow.normalBias).toBeCloseTo(texelDiagonal(sun), LENGTH_PRECISION)
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

    expect(largeSun.shadow.normalBias).toBeCloseTo(smallSun.shadow.normalBias * 2, LENGTH_PRECISION)
  })

  it('covers a steeper surface than its depth bias could reach alone', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToDirection(scene, { x: 1, y: 2, z: 0.35 }, SHELL_BOUNDS)

    // Coverage is bounded, not universal: the error term grows without limit toward grazing
    // incidence, so the question is how steep a surface the pair reaches, and whether the
    // normal offset earns its place by reaching further than the depth bias does on its own.
    const pairLimit = coverageLimitRadians(sun, sun.shadow.normalBias)
    const depthBiasOnlyLimit = coverageLimitRadians(sun, 0)

    expect(pairLimit).toBeGreaterThan(depthBiasOnlyLimit)
    // Every orientation the depth bias alone leaves uncovered, up to the pair's own limit, is
    // covered once the normal offset is in play. This is what fails if normalBias goes to zero.
    const samples = 20
    for (let sample = 1; sample <= samples; sample += 1) {
      const theta = depthBiasOnlyLimit + ((pairLimit - depthBiasOnlyLimit) * sample) / samples
      expect(compensationAt(sun, theta)).toBeGreaterThanOrEqual(depthErrorAt(sun, theta))
    }
  })

  it('reaches 45 degrees on its depth bias alone, since that bias is one whole diagonal', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    // With no normal offset the condition is `diagonal >= diagonal * tan(theta)`, so the limit
    // is wherever tan reaches 1, independently of scene size or texel count.
    expect(coverageLimitRadians(sun, 0)).toBeCloseTo(Math.PI / 4, ANGLE_PRECISION)
  })

  it('reaches the angle where the normal offset stops outrunning the error', () => {
    const scene = new THREE.Scene()
    const sun = castingSun(scene)

    fitSunShadowToBounds(scene, SHELL_BOUNDS)

    // Both halves of the pair are one diagonal, so the condition reduces to
    // `cos(theta) + 1 >= tan(theta)` and the limit is the root of that equation, near 57
    // degrees. Asserting the equation rather than the angle keeps the derivation in the test.
    const limit = coverageLimitRadians(sun, sun.shadow.normalBias)
    expect(Math.cos(limit) + 1).toBeCloseTo(Math.tan(limit), ANGLE_PRECISION)
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
