import { describe, expect, it } from 'vitest'
import { boundsRadius, shadowFitBounds } from './shadow-fit'
import type { Bounds3, Vector3 } from '../scene/vector3'

// The world frame is right-handed and Y-up (core/scene/vector3.ts), lengths are
// millimetres. The sun direction points FROM the scene TOWARD the sun, so a
// shadow falls on the opposite side: a point at height h above the ground lands
// h / tan(altitude) away from the sun along the ground. With the casters' top
// at 2600 mm:
//   45 degree sun: 2600 / tan(45) = 2600, so the shadow reaches x = 0 - 2600.
//   5 degree sun:  2600 / tan(5) is about 29718, far past the ground's -5000.

const CASTERS: Bounds3 = {
  min: { x: 0, y: 0, z: -3000 },
  max: { x: 4000, y: 2600, z: 0 },
}
const GROUND: Bounds3 = {
  min: { x: -5000, y: 0, z: -8000 },
  max: { x: 9000, y: 0, z: 5000 },
}
const NO_CAP = 1e9
const ONE_MILLIMETRE = 1

const FIVE_DEGREES = (5 * Math.PI) / 180
const OVERHEAD: Vector3 = { x: 0, y: 1, z: 0 }
const FORTY_FIVE_DEGREES: Vector3 = { x: 0.7071, y: 0.7071, z: 0 }
const FIVE_DEGREES_UP: Vector3 = { x: Math.cos(FIVE_DEGREES), y: Math.sin(FIVE_DEGREES), z: 0 }
const ON_THE_HORIZON: Vector3 = { x: 1, y: 0, z: 0 }
const BELOW_THE_HORIZON: Vector3 = { x: 0.995, y: -0.0995, z: 0 }

function numbersOf(bounds: Bounds3): number[] {
  const { min, max } = bounds
  return [min.x, min.y, min.z, max.x, max.y, max.z]
}

function expectWithin(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
}

describe('boundsRadius', () => {
  it('is half the diagonal of the box', () => {
    expect(boundsRadius(CASTERS)).toBeCloseTo(Math.hypot(4000, 2600, 3000) / 2, 6)
  })
})

describe('shadowFitBounds', () => {
  it('equals the casters when the sun is straight overhead', () => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: GROUND,
      sunDirection: OVERHEAD,
      maxRadius: NO_CAP,
    })
    expect(fit).toEqual(CASTERS)
  })

  it.each([
    ['a sun overhead', OVERHEAD],
    ['a sun 5 degrees up', FIVE_DEGREES_UP],
    ['a sun on the horizon', ON_THE_HORIZON],
    ['a sun below the horizon', BELOW_THE_HORIZON],
  ])('equals the casters when there is no ground, for %s', (_name, sunDirection) => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: null,
      sunDirection,
      maxRadius: NO_CAP,
    })
    expect(fit).toEqual(CASTERS)
  })

  it('extends the fit to where the roof edge casts its shadow on the ground', () => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: GROUND,
      sunDirection: FORTY_FIVE_DEGREES,
      maxRadius: NO_CAP,
    })
    expectWithin(fit.min.x, -2600, ONE_MILLIMETRE)
    expect(fit.min.y).toBe(CASTERS.min.y)
    expect(fit.min.z).toBe(CASTERS.min.z)
    expect(fit.max).toEqual(CASTERS.max)
  })

  it('clips the shadow of a low sun to the edge of the ground', () => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: GROUND,
      sunDirection: FIVE_DEGREES_UP,
      maxRadius: NO_CAP,
    })
    expectWithin(fit.min.x, -5000, ONE_MILLIMETRE)
  })

  it.each([
    ['on the horizon', ON_THE_HORIZON],
    ['below the horizon', BELOW_THE_HORIZON],
  ])(
    'reaches the ground edge away from a sun %s with every value finite',
    (_name, sunDirection) => {
      const fit = shadowFitBounds({
        casters: CASTERS,
        ground: GROUND,
        sunDirection,
        maxRadius: NO_CAP,
      })
      expectWithin(fit.min.x, -5000, ONE_MILLIMETRE)
      expect(numbersOf(fit).every(Number.isFinite)).toBe(true)
    },
  )

  it('keeps a basement in the fit and projects no corner that lies below the ground', () => {
    const casters: Bounds3 = {
      min: { x: 0, y: -2400, z: -3000 },
      max: { x: 4000, y: 2600, z: 0 },
    }
    const fit = shadowFitBounds({
      casters,
      ground: GROUND,
      sunDirection: FORTY_FIVE_DEGREES,
      maxRadius: NO_CAP,
    })
    expect(fit.min.y).toBe(-2400)
    // Projecting the basement floor corners toward the sun would land them at
    // x = 4000 + 2400 = 6400 and push the far edge out; they must stay out.
    expect(fit.max).toEqual(casters.max)
    expectWithin(fit.min.x, -2600, ONE_MILLIMETRE)
  })

  it('shrinks the fit toward the casters until its radius equals the cap', () => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: GROUND,
      sunDirection: FIVE_DEGREES_UP,
      maxRadius: 4000,
    })
    // The uncapped box spans x in [-5000, 4000], radius about 4918, above the
    // cap of 4000 and above the casters' own radius of about 2818.
    expectWithin(boundsRadius(fit), 4000, ONE_MILLIMETRE)
    expect(fit.max).toEqual(CASTERS.max)
    expect(fit.min.x).toBeGreaterThan(-5000)
    expect(fit.min.x).toBeLessThan(0)
  })

  it('never shrinks the casters, so a cap under their own radius returns them', () => {
    const fit = shadowFitBounds({
      casters: CASTERS,
      ground: GROUND,
      sunDirection: FIVE_DEGREES_UP,
      maxRadius: 2000,
    })
    expect(fit).toEqual(CASTERS)
    expect(numbersOf(fit).every(Number.isFinite)).toBe(true)
  })

  it('returns very large casters unchanged when their radius already exceeds the cap', () => {
    // 60 m by 40 m by 30 m: radius hypot(60000, 40000, 30000) / 2 is about 39051.
    const casters: Bounds3 = {
      min: { x: 0, y: 0, z: -30000 },
      max: { x: 60000, y: 40000, z: 0 },
    }
    const fit = shadowFitBounds({
      casters,
      ground: GROUND,
      sunDirection: FORTY_FIVE_DEGREES,
      maxRadius: 20000,
    })
    expect(fit).toEqual(casters)
    expect(numbersOf(fit).every(Number.isFinite)).toBe(true)
  })
})
