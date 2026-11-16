import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_CALIBRATION,
  relativeAirMass,
  SUN_OPTICAL_DEPTH,
  sunLevelAt,
} from './daylight-calibration'
import {
  FROZEN_SUN_SCALE,
  kastenYoungAirMass,
  kastenYoungFade,
  LOW_SUN_CHROMA_MINIMUM,
  shadeOf,
  SUN_OPTICAL_DEPTH_RECORDED,
} from './daylight-test-support'
import type { EnvironmentLighting } from './environment-lighting'
import { predictedMatteRadiance, type MatteSurface } from './light-model'
import { skyLighting } from './sky-model'
import { projectDomeToSphericalHarmonics } from './spherical-harmonics'
import { agxNeutralResponse } from './tone-response'
import { linearLuminance } from '../color/contrast'
import { relativeAirMass as relativeAirMassFromCore } from '../index'
import type { Vector3 } from '../scene/vector3'

// The sun's level follows the light's path through a clear sky, measured by the relative air
// mass of Kasten and Young (1989), m(h) = 1 / (sin h + 0.50572 (h in degrees + 6.07995) ^ -1.6364).
// The level is the sun scale times exp(-0.21 (m(h) - m(zenith))), so exactly the sun scale at the
// zenith, and it is 0 at and below the horizon. That air mass stays finite at the horizon, so the
// level just above it is small but not 0. Heights are radians.

const DEGREES = Math.PI / 180
const CLEAR_SKY = 0

const FADE_TOLERANCE = 1e-12
const FADE_SAMPLE_HEIGHTS_IN_DEGREES = [0.5, 2, 5, 10, 20, 45, 60]
const FINE_GRID_FIRST_DEGREES = 0.5
const FINE_GRID_LAST_DEGREES = 90
const FINE_GRID_STEP_DEGREES = 0.5
const HEIGHTS_THAT_GIVE_NO_SUN = [0, -0.01, -0.1, -Math.PI / 2]

// Air mass at the stated heights, in degrees, to the stated figures.
const AIR_MASS_TOLERANCE = 5e-5
const AIR_MASS_BY_HEIGHT_IN_DEGREES: Array<[number, number]> = [
  [90, 0.99971],
  [44.9877, 1.4129],
  [5, 10.3058],
  [0.01, 37.7711],
]
const AIR_MASS_FORMULA_TOLERANCE = 1e-12

// A sun 0.0000001 degrees up: its level is about 0.0047, a small step down to 0 on the horizon.
const JUST_ABOVE_HORIZON = 1e-7 * DEGREES
const HORIZON_STEP_LEVEL_CEILING = 0.006
const REFERENCE_SUN_LEVEL = 10.005593
const HORIZON_STEP_FRACTION_OF_REFERENCE = 0.0005

// The sun level at each height, in degrees, from the light model for this fade.
const LEVEL_TOLERANCE = 2e-4
const SUN_LEVEL_BY_HEIGHT_IN_DEGREES: Array<[number, number]> = [
  [0.5, 0.0186],
  [1, 0.0536],
  [1.51, 0.1226],
  [2, 0.2274],
  [3, 0.5592],
  [5, 1.5459],
  [5.23, 1.6729],
  [10, 4.1653],
  [20, 7.3169],
  [30, 8.8556],
  [45, 10.0062],
  [60, 10.5647],
  [90, 10.9126],
]

const BYTE_RANGE = 255
const WALL_REFLECTANCE = 0.85
// The wall that squares up to a sun in the x-y plane: its normal is the sun's direction
// projected onto the horizontal.
const SUN_FACING_WALL_NORMAL: Vector3 = { x: 1, y: 0, z: 0 }
const WHITE_WALL: MatteSurface = {
  normal: SUN_FACING_WALL_NORMAL,
  reflectance: { r: WALL_REFLECTANCE, g: WALL_REFLECTANCE, b: WALL_REFLECTANCE },
}
const SUN_TERM_TOLERANCE_IN_CODES = 0.01
const TEN_DEGREES = 10 * DEGREES
const THREE_DEGREES_BELOW = -3 * DEGREES
const FIVE_DEGREES = 5 * DEGREES
const FIVE_DEGREE_SUN_WALL_CODE_CEILING = 180
const FIVE_DEGREE_SUN_MINIMUM_GAIN_IN_CODES = 20
const TWO_DEGREES = 2 * DEGREES
const TWO_DEGREE_SUN_WALL_CODE = 125.9
const WALL_CODE_TOLERANCE = 0.5

/**
 * A clear-sky lighting with the sun at the given height in the x-y plane (azimuth 0), the sun's
 * tint and the sky's tint and dome as the sky model gives them for that height, and the given
 * sun level. Built by hand so the wall cases state the sun's level directly and need no
 * knowledge of how an instant maps to a sun height.
 */
function lightingWithSunAt(height: number, sunLevel: number): EnvironmentLighting {
  const sunDirection = { x: Math.cos(height), y: Math.sin(height), z: 0 }
  const { sunColor, skyColor } = skyLighting(height, CLEAR_SKY)
  return {
    sunDirection,
    sunColor,
    skyColor,
    sunLevel,
    cloudCover: CLEAR_SKY,
    skyAmbient: projectDomeToSphericalHarmonics({ sunDirection, cloudCover: CLEAR_SKY }),
  }
}

function codeOfWhiteWall(lighting: EnvironmentLighting): number {
  return (
    agxNeutralResponse(linearLuminance(predictedMatteRadiance(lighting, WHITE_WALL))) * BYTE_RANGE
  )
}

function codeWithAndWithoutSun(height: number): { lit: number; domeOnly: number } {
  const lit = codeOfWhiteWall(lightingWithSunAt(height, sunLevelAt(height, CLEAR_SKY)))
  const domeOnly = codeOfWhiteWall(lightingWithSunAt(height, 0))
  return { lit, domeOnly }
}

describe('relativeAirMass', () => {
  it.each(AIR_MASS_BY_HEIGHT_IN_DEGREES)(
    'gives the Kasten and Young air mass at %s degrees, about %s',
    (degrees, stated) => {
      const height = degrees * DEGREES
      const airMass = relativeAirMass(height)
      expect(Math.abs(airMass - kastenYoungAirMass(height))).toBeLessThan(
        AIR_MASS_FORMULA_TOLERANCE,
      )
      expect(Math.abs(airMass - stated)).toBeLessThan(AIR_MASS_TOLERANCE)
    },
  )

  it('is exported from the core entry point', () => {
    expect(relativeAirMassFromCore).toBe(relativeAirMass)
  })
})

describe('the sun level', () => {
  it('records the optical depth of the clear sky as 0.21', () => {
    expect(SUN_OPTICAL_DEPTH).toBe(SUN_OPTICAL_DEPTH_RECORDED)
  })

  it('is exactly 0 on the horizon and below it', () => {
    for (const height of HEIGHTS_THAT_GIVE_NO_SUN) {
      expect(sunLevelAt(height, CLEAR_SKY)).toBe(0)
    }
  })

  it('steps to 0 at the horizon from a level just above it that is over 0 but under 0.006, under 0.05 percent of the reference level', () => {
    const level = sunLevelAt(JUST_ABOVE_HORIZON, CLEAR_SKY)
    expect(level).toBeGreaterThan(0)
    expect(level).toBeLessThan(HORIZON_STEP_LEVEL_CEILING)
    expect(level / REFERENCE_SUN_LEVEL).toBeLessThan(HORIZON_STEP_FRACTION_OF_REFERENCE)
  })

  it('follows exp(-0.21 (m(h) - m(zenith))) with the Kasten and Young air mass m, relative to the zenith', () => {
    for (const degrees of FADE_SAMPLE_HEIGHTS_IN_DEGREES) {
      const height = degrees * DEGREES
      const fraction = sunLevelAt(height, CLEAR_SKY) / DAYLIGHT_CALIBRATION.sunScale
      expect(Math.abs(fraction - kastenYoungFade(height))).toBeLessThan(FADE_TOLERANCE)
    }
  })

  it.each(SUN_LEVEL_BY_HEIGHT_IN_DEGREES)(
    'is about the stated level with the sun %s degrees up, %s',
    (degrees, stated) => {
      const height = degrees * DEGREES
      const derived = FROZEN_SUN_SCALE * kastenYoungFade(height)
      expect(Math.abs(derived - stated)).toBeLessThan(LEVEL_TOLERANCE)
      expect(Math.abs(sunLevelAt(height, CLEAR_SKY) - stated)).toBeLessThan(LEVEL_TOLERANCE)
    },
  )

  it('rises strictly with height from 0.5 to 90 degrees', () => {
    let previous = sunLevelAt(FINE_GRID_FIRST_DEGREES * DEGREES, CLEAR_SKY)
    for (
      let degrees = FINE_GRID_FIRST_DEGREES + FINE_GRID_STEP_DEGREES;
      degrees <= FINE_GRID_LAST_DEGREES;
      degrees += FINE_GRID_STEP_DEGREES
    ) {
      const level = sunLevelAt(degrees * DEGREES, CLEAR_SKY)
      expect(level).toBeGreaterThan(previous)
      previous = level
    }
  })
})

describe('a white wall squared up to a low sun', () => {
  it('gains nothing from the sun on the horizon and 3 degrees below it', () => {
    for (const height of [0, THREE_DEGREES_BELOW]) {
      const { lit, domeOnly } = codeWithAndWithoutSun(height)
      expect(Math.abs(lit - domeOnly)).toBeLessThan(SUN_TERM_TOLERANCE_IN_CODES)
    }
  })

  it('reads about code 125.9 with the sun 2 degrees up', () => {
    const { lit } = codeWithAndWithoutSun(TWO_DEGREES)
    expect(Math.abs(lit - TWO_DEGREE_SUN_WALL_CODE)).toBeLessThan(WALL_CODE_TOLERANCE)
  })

  it('reads under code 180, and at least 20 codes above the dome alone, with the sun 5 degrees up', () => {
    const { lit, domeOnly } = codeWithAndWithoutSun(FIVE_DEGREES)
    expect(lit).toBeLessThan(FIVE_DEGREE_SUN_WALL_CODE_CEILING)
    expect(lit - domeOnly).toBeGreaterThanOrEqual(FIVE_DEGREE_SUN_MINIMUM_GAIN_IN_CODES)
  })

  it('is warmed by a low sun: the wall facing it reads warm at 10 degrees and at 5 degrees', () => {
    for (const height of [TEN_DEGREES, FIVE_DEGREES]) {
      const tone = shadeOf(
        predictedMatteRadiance(
          lightingWithSunAt(height, sunLevelAt(height, CLEAR_SKY)),
          WHITE_WALL,
        ),
      )
      expect(tone.a).toBeGreaterThan(0)
      expect(tone.b).toBeGreaterThan(0)
      expect(tone.chroma).toBeGreaterThanOrEqual(LOW_SUN_CHROMA_MINIMUM)
    }
  })
})
