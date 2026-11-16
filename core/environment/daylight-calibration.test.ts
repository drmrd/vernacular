import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_CALIBRATION,
  directToDiffuseRatio,
  diffuseLevelAt,
  LUX_PER_UNIT_IRRADIANCE,
  levelCardLight,
  NIGHT_DIFFUSE_LEVEL,
  REFERENCE_HORIZONTAL_ILLUMINANCE_LUX,
  sunLevelAt,
  WHITE_CODE_FLOOR,
} from './daylight-calibration'
import { referenceLightingInput } from './daylight-reference'
import { computeEnvironmentLighting, type EnvironmentLightingInput } from './environment-lighting'
import { predictedMatteRadiance, type MatteSurface } from './light-model'
import { solarPosition } from './solar-position'
import { agxNeutralInverse, agxNeutralResponse } from './tone-response'
import { linearLuminance } from '../color/contrast'
import { linearToSrgb, srgbToOkLab, type LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'

// Daylight is calibrated from three stated targets: a white wall in the sun reads code 225
// after the tone curve, the sky and the sun stand in a stated ratio on a level card, and the
// card carries a stated illuminance in lux. A "level" is a luminance (weights 0.2126, 0.7152,
// 0.0722). Values on the level card (levelCardLight) are irradiance over pi. Heights are
// radians; the reference height is the sun height of referenceLightingInput(), never a rounded
// 45 degrees.

const DEGREES = Math.PI / 180
const FORTY_FIVE_DEGREES = Math.PI / 4
const TWENTY_DEGREES = 20 * DEGREES
const TEN_DEGREES = 10 * DEGREES
const CLEAR_SKY = 0
const PARTLY_CLOUDY = 0.5
const FULL_OVERCAST = 1

const EXACT_TOLERANCE = 1e-6
const TIGHT_TOLERANCE = 1e-9
const NIGHT_LEVEL_TOLERANCE = 1e-4
const NIGHT_LEVEL_RECORDED = 0.35 * 0.4445

const BYTE_RANGE = 255
const WHITE_CODE_TOLERANCE = 0.5
const SUNLIT_WALL_CODE_CEILING = 250
const WALL_REFLECTANCE = 0.85
const WALL_NORMAL = { x: 0, y: 0, z: 1 }
const WEST_WALL_NORMAL = { x: -1, y: 0, z: 0 }
const NORTH_WALL_NORMAL = { x: 0, y: 0, z: -1 }
const EQUINOX_NOON_INPUT: EnvironmentLightingInput = {
  latLong: { latitude: 40, longitude: -75 },
  observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
  utcOffsetMinutes: -300,
  northBearing: 0,
  cloudCover: 0,
}

const SHADE_CHROMA_MINIMUM = 0.02
const WALL_SHADE_GREEN_CAST_LIMIT = 0.015
const SHADE_CHROMA_MAXIMUM = 0.1
const LOW_SUN_CHROMA_MINIMUM = 0.01

const REFERENCE_LUX = 80_000
const LUX_TOLERANCE = 0.01
const OVERCAST_DIFFUSE_FRACTION = 0.7

const HEIGHTS_AT_OR_BELOW_HORIZON = [0, -0.05, -0.3, -Math.PI / 2]
const RISING_HEIGHTS = [0.1, 0.3, 0.5, 0.7, FORTY_FIVE_DEGREES]
const HEIGHT_SWEEP_STEPS = 60
const SWEEP_CLOUD_COVERS = [CLEAR_SKY, PARTLY_CLOUDY, FULL_OVERCAST]
const SAMPLE_HEIGHTS = [Math.PI / 2, 0.7, TWENTY_DEGREES, TEN_DEGREES, 0, -0.3]

const POLAR_NIGHT_INPUT: EnvironmentLightingInput = {
  latLong: { latitude: 78.2, longitude: 15.6 },
  observedAt: { date: '2026-12-21', minutesSinceMidnight: 630 },
  utcOffsetMinutes: 60,
  northBearing: 0,
  cloudCover: 0,
}
const SPHERICAL_HARMONIC_COEFFICIENT_COUNT = 27

function referenceHeight(): number {
  const input = referenceLightingInput()
  return solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  }).altitude
}

function referenceLighting(): ReturnType<typeof computeEnvironmentLighting> {
  return computeEnvironmentLighting(referenceLightingInput())
}

function sumOf(a: LinearRgb, b: LinearRgb): LinearRgb {
  return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b }
}

function wallOf(reflectance: number, normal: Vector3): MatteSurface {
  return { normal, reflectance: { r: reflectance, g: reflectance, b: reflectance } }
}

/** Scales so the largest channel is 1, encodes to sRGB, and returns the OKLab color. */
function shadeOf(color: LinearRgb): { a: number; b: number; chroma: number } {
  const largest = Math.max(color.r, color.g, color.b)
  const lab = srgbToOkLab({
    r: linearToSrgb(color.r / largest),
    g: linearToSrgb(color.g / largest),
    b: linearToSrgb(color.b / largest),
  })
  return { a: lab.a, b: lab.b, chroma: Math.hypot(lab.a, lab.b) }
}

function expectEqualChannels(color: LinearRgb): void {
  expect(Math.abs(color.r - color.g)).toBeLessThan(EXACT_TOLERANCE)
  expect(Math.abs(color.g - color.b)).toBeLessThan(EXACT_TOLERANCE)
}

function codeOfWall(normal: Vector3): number {
  const lighting = referenceLighting()
  const level = linearLuminance(predictedMatteRadiance(lighting, wallOf(WALL_REFLECTANCE, normal)))
  return agxNeutralResponse(level) * BYTE_RANGE
}

describe('directToDiffuseRatio', () => {
  it('is 5 at 45 degrees', () => {
    expect(Math.abs(directToDiffuseRatio(FORTY_FIVE_DEGREES) - 5)).toBeLessThan(TIGHT_TOLERANCE)
  })

  it('is exactly 1 at the horizon and below', () => {
    for (const height of HEIGHTS_AT_OR_BELOW_HORIZON) {
      expect(directToDiffuseRatio(height)).toBe(1)
    }
  })

  it('rises with height between the horizon and 45 degrees', () => {
    let previous = directToDiffuseRatio(0)
    for (const height of RISING_HEIGHTS) {
      const ratio = directToDiffuseRatio(height)
      expect(ratio).toBeGreaterThan(previous)
      previous = ratio
    }
  })
})

describe('levelCardLight at the reference height', () => {
  it('makes the sun level over the sky level equal the direct-to-diffuse ratio', () => {
    const height = referenceHeight()
    const card = levelCardLight(height, CLEAR_SKY)
    const ratio = linearLuminance(card.sun) / linearLuminance(card.sky)
    expect(Math.abs(ratio - directToDiffuseRatio(height))).toBeLessThan(EXACT_TOLERANCE)
  })

  it('makes sun plus sky on the card a neutral white', () => {
    const card = levelCardLight(referenceHeight(), CLEAR_SKY)
    expectEqualChannels(sumOf(card.sun, card.sky))
  })

  it('leaves the shade blue, with a chroma between 0.02 and 0.10', () => {
    const shade = shadeOf(levelCardLight(referenceHeight(), CLEAR_SKY).sky)
    expect(shade.b).toBeLessThan(0)
    expect(shade.chroma).toBeGreaterThan(SHADE_CHROMA_MINIMUM)
    expect(shade.chroma).toBeLessThan(SHADE_CHROMA_MAXIMUM)
  })

  it('carries 80000 lux on the level card', () => {
    expect(REFERENCE_HORIZONTAL_ILLUMINANCE_LUX).toBe(REFERENCE_LUX)
    const card = levelCardLight(referenceHeight(), CLEAR_SKY)
    const lux = LUX_PER_UNIT_IRRADIANCE * Math.PI * linearLuminance(sumOf(card.sun, card.sky))
    expect(Math.abs(lux - REFERENCE_LUX)).toBeLessThan(LUX_TOLERANCE)
  })
})

describe('levelCardLight under a low sun', () => {
  it('warms the light on the level card at 20 degrees', () => {
    const card = levelCardLight(TWENTY_DEGREES, CLEAR_SKY)
    const tone = shadeOf(sumOf(card.sun, card.sky))
    expect(tone.a).toBeGreaterThan(0)
    expect(tone.b).toBeGreaterThan(0)
    expect(tone.chroma).toBeGreaterThanOrEqual(LOW_SUN_CHROMA_MINIMUM)
  })
})

describe('the white wall', () => {
  it('reads code 225 after the tone curve on a wall facing +z at the reference instant', () => {
    expect(Math.abs(codeOfWall(WALL_NORMAL) - WHITE_CODE_FLOOR)).toBeLessThan(WHITE_CODE_TOLERANCE)
  })

  it('stays under code 250 on the same wall square to the sun', () => {
    const squareToSun = referenceLighting().sunDirection
    expect(codeOfWall(squareToSun)).toBeLessThan(SUNLIT_WALL_CODE_CEILING)
  })

  it('records the linear level of code 225 as the sunlit white level', () => {
    expect(WHITE_CODE_FLOOR).toBe(225)
    expect(DAYLIGHT_CALIBRATION.sunlitWhiteLevel).toBe(agxNeutralInverse(225 / BYTE_RANGE))
  })
})

describe('a white wall in shade', () => {
  it('shows no green cast on the west wall at the reference instant', () => {
    const shade = shadeOf(
      predictedMatteRadiance(referenceLighting(), wallOf(WALL_REFLECTANCE, WEST_WALL_NORMAL)),
    )
    expect(Math.abs(shade.a)).toBeLessThan(WALL_SHADE_GREEN_CAST_LIMIT)
    expect(shade.b).toBeLessThan(0)
  })

  it('shows no green cast on the north wall at equinox noon at 40 N, 75 W', () => {
    const lighting = computeEnvironmentLighting(EQUINOX_NOON_INPUT)
    const shade = shadeOf(
      predictedMatteRadiance(lighting, wallOf(WALL_REFLECTANCE, NORTH_WALL_NORMAL)),
    )
    expect(Math.abs(shade.a)).toBeLessThan(WALL_SHADE_GREEN_CAST_LIMIT)
    expect(shade.b).toBeLessThan(0)
  })
})

describe('the sun level', () => {
  it('is the sun scale with the sun at the zenith under a clear sky', () => {
    expect(sunLevelAt(Math.PI / 2, CLEAR_SKY)).toBe(DAYLIGHT_CALIBRATION.sunScale)
  })

  it('is what computeEnvironmentLighting reports at the reference height', () => {
    const expected = sunLevelAt(referenceHeight(), CLEAR_SKY)
    expect(Math.abs(referenceLighting().sunLevel - expected)).toBeLessThan(TIGHT_TOLERANCE)
  })
})

describe('the diffuse level', () => {
  it('records the level below the horizon as 0.35 times 0.4445', () => {
    expect(Math.abs(NIGHT_DIFFUSE_LEVEL - NIGHT_LEVEL_RECORDED)).toBeLessThan(TIGHT_TOLERANCE)
  })

  it('puts the luminance of the sky on the card at the night level at or below the horizon', () => {
    for (const height of HEIGHTS_AT_OR_BELOW_HORIZON) {
      const level = linearLuminance(levelCardLight(height, CLEAR_SKY).sky)
      expect(Math.abs(level - NIGHT_DIFFUSE_LEVEL)).toBeLessThan(NIGHT_LEVEL_TOLERANCE)
    }
  })

  it('never decreases with height', () => {
    for (const cloudCover of SWEEP_CLOUD_COVERS) {
      let previous = Number.NEGATIVE_INFINITY
      for (let step = 0; step <= HEIGHT_SWEEP_STEPS; step += 1) {
        const height = -Math.PI / 2 + (Math.PI * step) / HEIGHT_SWEEP_STEPS
        const level = diffuseLevelAt(height, cloudCover)
        expect(level).toBeGreaterThanOrEqual(previous)
        previous = level
      }
    }
  })

  it('is the luminance of the sky on the level card at every sampled height', () => {
    for (const height of SAMPLE_HEIGHTS) {
      const level = linearLuminance(levelCardLight(height, PARTLY_CLOUDY).sky)
      expect(Math.abs(level - diffuseLevelAt(height, PARTLY_CLOUDY))).toBeLessThan(EXACT_TOLERANCE)
    }
  })
})

describe('full overcast', () => {
  it('leaves no sun level', () => {
    const overcast = computeEnvironmentLighting({ ...referenceLightingInput(), cloudCover: 1 })
    expect(overcast.sunLevel).toBe(0)
  })

  it('drops the diffuse level to 0.7 times the clear one', () => {
    const height = referenceHeight()
    const clear = diffuseLevelAt(height, CLEAR_SKY)
    const overcast = diffuseLevelAt(height, FULL_OVERCAST)
    expect(Math.abs(overcast - OVERCAST_DIFFUSE_FRACTION * clear)).toBeLessThan(TIGHT_TOLERANCE)
  })

  it('makes the sky on the card a neutral grey', () => {
    expectEqualChannels(levelCardLight(referenceHeight(), FULL_OVERCAST).sky)
  })
})

describe('a polar night', () => {
  it('has no sun, finite coefficients, and still lights a white vertical wall', () => {
    const lighting = computeEnvironmentLighting(POLAR_NIGHT_INPUT)
    expect(lighting.sunLevel).toBe(0)
    expect(lighting.skyAmbient).toHaveLength(SPHERICAL_HARMONIC_COEFFICIENT_COUNT)
    expect(lighting.skyAmbient.every(Number.isFinite)).toBe(true)
    const wall = wallOf(1, WALL_NORMAL)
    expect(linearLuminance(predictedMatteRadiance(lighting, wall))).toBeGreaterThan(0)
  })
})
