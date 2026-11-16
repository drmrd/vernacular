import { describe, expect, it } from 'vitest'
import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import type { EnvironmentLighting } from './environment-lighting'
import { predictedMatteRadiance, skyAmbientLevel } from './light-model'
import { NEUTRAL_DOME_SPHERICAL_HARMONICS } from './spherical-harmonics'

const TOLERANCE = 1e-6

// The basis constants of the public spherical-harmonic convention (Y00 is constant, Y1 along
// y is 0.488603 * y), used to build a dome whose radiance is exactly 1 + y.
const BAND_0_BASIS = 0.282095
const BAND_1_BASIS = 0.488603
const BAND_1_Y_COEFFICIENT_INDEX = 1
const CHANNELS_PER_COEFFICIENT = 3

function gradientAmbient(): number[] {
  const coefficients = new Array<number>(NEUTRAL_DOME_SPHERICAL_HARMONICS.length).fill(0)
  const yStart = BAND_1_Y_COEFFICIENT_INDEX * CHANNELS_PER_COEFFICIENT
  for (let channel = 0; channel < CHANNELS_PER_COEFFICIENT; channel += 1) {
    coefficients[channel] = 1 / BAND_0_BASIS
    coefficients[yStart + channel] = 1 / BAND_1_BASIS
  }
  return coefficients
}

const UP: Vector3 = { x: 0, y: 1, z: 0 }
const DOWN: Vector3 = { x: 0, y: -1, z: 0 }
const EAST: Vector3 = { x: 1, y: 0, z: 0 }
const WEST: Vector3 = { x: -1, y: 0, z: 0 }
const OBLIQUE_HORIZONTAL: Vector3 = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
const OBLIQUE_UP: Vector3 = { x: 0.6, y: 0.8, z: 0 }

// The irradiance over pi of a 1 + y radiance: the band-1 term is weighted by 2/3 once the
// cosine lobe is applied, and the constant term passes through.
const BAND_1_COSINE_WEIGHT = 2 / 3
const LEVEL_FACING_UP = 1 + BAND_1_COSINE_WEIGHT
const LEVEL_FACING_DOWN = 1 - BAND_1_COSINE_WEIGHT
const LEVEL_FACING_HORIZONTALLY = 1

const SUN_DIRECTION: Vector3 = { x: 0.6, y: 0.8, z: 0 }
const SUN_COLOR: LinearRgb = { r: 1, g: 0.9, b: 0.7 }
const SUN_LEVEL = 0.75
const REFLECTANCE: LinearRgb = { r: 0.8, g: 0.5, b: 0.2 }

function lightingWithAmbient(skyAmbient: readonly number[]): EnvironmentLighting {
  return {
    sunDirection: SUN_DIRECTION,
    sunColor: SUN_COLOR,
    skyColor: { r: 0.5, g: 0.6, b: 0.8 },
    sunLevel: SUN_LEVEL,
    cloudCover: 0,
    skyAmbient,
  }
}

function expectRgbClose(actual: LinearRgb, expected: LinearRgb): void {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(TOLERANCE)
}

function uniformRgb(level: number): LinearRgb {
  return { r: level, g: level, b: level }
}

describe('skyAmbientLevel', () => {
  it.each([UP, DOWN, OBLIQUE_HORIZONTAL])(
    'is (1, 1, 1) for the uniform white dome facing %o',
    (normal) => {
      expectRgbClose(skyAmbientLevel(NEUTRAL_DOME_SPHERICAL_HARMONICS, normal), uniformRgb(1))
    },
  )

  it('is 1 + 2/3 facing up for an ambient whose radiance is 1 + y', () => {
    expectRgbClose(skyAmbientLevel(gradientAmbient(), UP), uniformRgb(LEVEL_FACING_UP))
  })

  it('is 1 - 2/3 facing down for an ambient whose radiance is 1 + y', () => {
    expectRgbClose(skyAmbientLevel(gradientAmbient(), DOWN), uniformRgb(LEVEL_FACING_DOWN))
  })

  it('is 1 facing a horizontal direction for an ambient whose radiance is 1 + y', () => {
    expectRgbClose(
      skyAmbientLevel(gradientAmbient(), OBLIQUE_HORIZONTAL),
      uniformRgb(LEVEL_FACING_HORIZONTALLY),
    )
  })
})

describe('predictedMatteRadiance', () => {
  it('is the reflectance times the sun term plus the sky level for a surface facing the sun', () => {
    const lighting = lightingWithAmbient(gradientAmbient())
    const facing = OBLIQUE_UP.x * SUN_DIRECTION.x + OBLIQUE_UP.y * SUN_DIRECTION.y
    const sunTerm = (sunChannel: number): number => (sunChannel * SUN_LEVEL * facing) / Math.PI
    const skyLevel = 1 + BAND_1_COSINE_WEIGHT * OBLIQUE_UP.y

    expectRgbClose(
      predictedMatteRadiance(lighting, { normal: OBLIQUE_UP, reflectance: REFLECTANCE }),
      {
        r: REFLECTANCE.r * (sunTerm(SUN_COLOR.r) + skyLevel),
        g: REFLECTANCE.g * (sunTerm(SUN_COLOR.g) + skyLevel),
        b: REFLECTANCE.b * (sunTerm(SUN_COLOR.b) + skyLevel),
      },
    )
  })

  it('gets the sky term alone for a surface turned away from the sun', () => {
    const lighting = lightingWithAmbient(gradientAmbient())

    expectRgbClose(predictedMatteRadiance(lighting, { normal: WEST, reflectance: REFLECTANCE }), {
      r: REFLECTANCE.r * LEVEL_FACING_HORIZONTALLY,
      g: REFLECTANCE.g * LEVEL_FACING_HORIZONTALLY,
      b: REFLECTANCE.b * LEVEL_FACING_HORIZONTALLY,
    })
  })

  it('adds the sun term only on the side that faces the sun', () => {
    const lighting = lightingWithAmbient(gradientAmbient())
    const towardSun = predictedMatteRadiance(lighting, { normal: EAST, reflectance: REFLECTANCE })
    const awayFromSun = predictedMatteRadiance(lighting, { normal: WEST, reflectance: REFLECTANCE })

    expect(towardSun.r).toBeGreaterThan(awayFromSun.r)
    expect(towardSun.g).toBeGreaterThan(awayFromSun.g)
    expect(towardSun.b).toBeGreaterThan(awayFromSun.b)
  })
})
