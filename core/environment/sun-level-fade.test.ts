import { describe, expect, it } from 'vitest'
import { DAYLIGHT_CALIBRATION, SUN_OPTICAL_DEPTH, sunLevelAt } from './daylight-calibration'
import type { EnvironmentLighting } from './environment-lighting'
import { predictedMatteRadiance, type MatteSurface } from './light-model'
import { skyLighting } from './sky-model'
import { projectDomeToSphericalHarmonics } from './spherical-harmonics'
import { agxNeutralResponse } from './tone-response'
import { linearLuminance } from '../color/contrast'
import { linearToSrgb, srgbToOkLab } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'

// The sun's level follows the light's path through a clear sky: the level is proportional to
// exp(-0.21 / sin h), scaled so it is exactly the sun scale at the zenith, and it is 0 at and
// below the horizon. Heights are radians.

const DEGREES = Math.PI / 180
const CLEAR_SKY = 0

const SUN_OPTICAL_DEPTH_RECORDED = 0.21
const FADE_TOLERANCE = 1e-12
const FADE_SAMPLE_HEIGHTS_IN_DEGREES = [5, 10, 20, 45, 60]
const FINE_GRID_FIRST_DEGREES = 0.5
const FINE_GRID_LAST_DEGREES = 90
const FINE_GRID_STEP_DEGREES = 0.5
const HEIGHTS_THAT_GIVE_NO_SUN = [0, -0.01, -0.1, -Math.PI / 2]
const NO_STEP_AT_HORIZON_HEIGHT = 1e-3
const NO_STEP_AT_HORIZON_FRACTION = 1e-6

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
const LOW_SUN_CHROMA_MINIMUM = 0.01
const TEN_DEGREES = 10 * DEGREES
const THREE_DEGREES_BELOW = -3 * DEGREES
const FIVE_DEGREES = 5 * DEGREES
const FIVE_DEGREE_SUN_WALL_CODE_CEILING = 180
const FIVE_DEGREE_SUN_MINIMUM_GAIN_IN_CODES = 20

function clearSkyFade(height: number): number {
  return Math.exp(-SUN_OPTICAL_DEPTH_RECORDED * (1 / Math.sin(height) - 1))
}

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

/** The wall's radiance scaled so its largest channel is 1, encoded to sRGB, as an OKLab tone. */
function shadeOfWhiteWall(lighting: EnvironmentLighting): {
  a: number
  b: number
  chroma: number
} {
  const radiance = predictedMatteRadiance(lighting, WHITE_WALL)
  const largest = Math.max(radiance.r, radiance.g, radiance.b)
  const lab = srgbToOkLab({
    r: linearToSrgb(radiance.r / largest),
    g: linearToSrgb(radiance.g / largest),
    b: linearToSrgb(radiance.b / largest),
  })
  return { a: lab.a, b: lab.b, chroma: Math.hypot(lab.a, lab.b) }
}

function codeWithAndWithoutSun(height: number): { lit: number; domeOnly: number } {
  const lit = codeOfWhiteWall(lightingWithSunAt(height, sunLevelAt(height, CLEAR_SKY)))
  const domeOnly = codeOfWhiteWall(lightingWithSunAt(height, 0))
  return { lit, domeOnly }
}

describe('the sun level', () => {
  it('records the optical depth of the clear sky as 0.21', () => {
    expect(SUN_OPTICAL_DEPTH).toBe(SUN_OPTICAL_DEPTH_RECORDED)
  })

  it('is exactly 0 on the horizon and below it', () => {
    for (const height of HEIGHTS_THAT_GIVE_NO_SUN) {
      expect(sunLevelAt(height, CLEAR_SKY)).toBe(0)
    }
  })

  it('has no step at the horizon: a sun 0.001 radians up is under a millionth of the sun scale', () => {
    const { sunScale } = DAYLIGHT_CALIBRATION
    expect(sunLevelAt(NO_STEP_AT_HORIZON_HEIGHT, CLEAR_SKY)).toBeLessThan(
      NO_STEP_AT_HORIZON_FRACTION * sunScale,
    )
  })

  it('follows the clear-sky attenuation exp(-0.21 / sin h) of the direct sun, as a fraction of the sun scale', () => {
    for (const degrees of FADE_SAMPLE_HEIGHTS_IN_DEGREES) {
      const height = degrees * DEGREES
      const fraction = sunLevelAt(height, CLEAR_SKY) / DAYLIGHT_CALIBRATION.sunScale
      expect(Math.abs(fraction - clearSkyFade(height))).toBeLessThan(FADE_TOLERANCE)
    }
  })

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

  it('reads under code 180, and at least 20 codes above the dome alone, with the sun 5 degrees up', () => {
    const { lit, domeOnly } = codeWithAndWithoutSun(FIVE_DEGREES)
    expect(lit).toBeLessThan(FIVE_DEGREE_SUN_WALL_CODE_CEILING)
    expect(lit - domeOnly).toBeGreaterThanOrEqual(FIVE_DEGREE_SUN_MINIMUM_GAIN_IN_CODES)
  })

  it('is warmed by a low sun: the wall facing it reads warm at 10 degrees and at 5 degrees', () => {
    for (const height of [TEN_DEGREES, FIVE_DEGREES]) {
      const tone = shadeOfWhiteWall(lightingWithSunAt(height, sunLevelAt(height, CLEAR_SKY)))
      expect(tone.a).toBeGreaterThan(0)
      expect(tone.b).toBeGreaterThan(0)
      expect(tone.chroma).toBeGreaterThanOrEqual(LOW_SUN_CHROMA_MINIMUM)
    }
  })
})
