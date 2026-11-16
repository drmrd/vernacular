import { describe, expect, it } from 'vitest'
import { DAYLIGHT_CALIBRATION } from './daylight-calibration'
import { skyLighting } from './sky-model'
import { linearToSrgb, type LinearRgb } from '../color/oklab'
import { linearLuminance, relativeLuminance } from '../color/contrast'

// The clear-sky model is an analytic fit, not a published reference table, so
// these tests pin down relational facts only: how the sun and sky colors move
// as the sun climbs, sets, and disappears behind cloud. Altitudes are radians,
// matching solarPosition, and negative below the horizon. Cloud cover runs
// 0 (clear) to 1 (overcast). Both output colors are linear RGB.

const HIGH_SUN_ALTITUDE = Math.PI / 2
const MODERATE_SUN_ALTITUDE = 0.7
const HORIZON_SUN_ALTITUDE = 0.05
const ON_HORIZON_ALTITUDE = 0
const JUST_BELOW_HORIZON_ALTITUDE = -0.02
const EXTINCTION_LIMIT_ALTITUDE = -0.1
const BELOW_HORIZON_ALTITUDE = -0.2
// The altitudes a sun descending through the horizon band passes through, in order.
const DESCENDING_ALTITUDES_THROUGH_HORIZON_BAND = [
  0.2, 0.1, 0.05, 0, -0.02, -0.05, -0.08, -0.1, -0.2,
]

const CLEAR_SKY = 0
const LIGHT_CLOUD_COVER = 0.3
const HEAVY_OVERCAST = 0.9
const FULL_OVERCAST = 1
// Cloud cover values a thickening sky passes through, in order.
const ASCENDING_CLOUD_COVER_SEQUENCE = [0, 0.25, 0.5, 0.75, 1]
// Full overcast must leave at most this fraction of the clear-sky sunLevel,
// so the direct beam (and the crisp shadows it casts) is effectively gone.
const OVERCAST_SUN_LEVEL_FRACTION_LIMIT = 0.05
// Light cloud must keep at least this fraction of the clear-sky sunLevel,
// pinning the convex attenuation curve's mild low-cloud-cover response.
const LIGHT_CLOUD_LEVEL_RETENTION_MINIMUM = 0.9

// Near-white means the brightest channel exceeds the dimmest by at most 15%.
const NEAR_WHITE_CHANNEL_RATIO = 1.15
// The sun tint is scaled to luminance 1 at every height; the dimming is left to sunLevel.
const SUN_COLOR_LUMINANCE = 1
const SUN_COLOR_LUMINANCE_TOLERANCE = 1e-6
// Heights from overhead to well below the horizon.
const SUN_COLOR_SAMPLE_ALTITUDES = [
  HIGH_SUN_ALTITUDE,
  MODERATE_SUN_ALTITUDE,
  0.2,
  HORIZON_SUN_ALTITUDE,
  ON_HORIZON_ALTITUDE,
  JUST_BELOW_HORIZON_ALTITUDE,
  BELOW_HORIZON_ALTITUDE,
]
// Fraction of the full sun level the design documents for the sun exactly on the horizon.
const HORIZON_SUN_LEVEL_FRACTION = 0.35

function luminance(color: LinearRgb): number {
  return relativeLuminance({
    r: linearToSrgb(color.r),
    g: linearToSrgb(color.g),
    b: linearToSrgb(color.b),
  })
}

function channelSpread(color: LinearRgb): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
}

function summedLevel(color: LinearRgb): number {
  return color.r + color.g + color.b
}

function blueFraction(color: LinearRgb): number {
  return color.b / summedLevel(color)
}

describe('skyLighting', () => {
  it('renders the high clear-sky sun near white and delivering more light than the horizon sun', () => {
    const high = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const horizon = skyLighting(HORIZON_SUN_ALTITUDE, CLEAR_SKY)
    const highSun = high.sunColor
    const brightestChannel = Math.max(highSun.r, highSun.g, highSun.b)
    const dimmestChannel = Math.min(highSun.r, highSun.g, highSun.b)
    expect(brightestChannel).toBeLessThanOrEqual(dimmestChannel * NEAR_WHITE_CHANNEL_RATIO)
    expect(high.sunLevel).toBeGreaterThan(horizon.sunLevel)
  })

  it('warms the direct sun at the horizon and dims it through sunLevel', () => {
    const horizon = skyLighting(HORIZON_SUN_ALTITUDE, CLEAR_SKY)
    const high = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    expect(horizon.sunColor.r).toBeGreaterThan(horizon.sunColor.b)
    expect(horizon.sunLevel).toBeLessThan(high.sunLevel)
  })

  it('reaches the sun scale at the zenith and 0.35 of it exactly on the horizon', () => {
    const { sunScale } = DAYLIGHT_CALIBRATION
    const zenith = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const horizon = skyLighting(ON_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(zenith.sunLevel).toBe(sunScale)
    expect(horizon.sunLevel).toBeCloseTo(HORIZON_SUN_LEVEL_FRACTION * sunScale, 5)
  })

  it('extinguishes sunLevel once the sun passes the extinction limit below the horizon', () => {
    const justBelowHorizon = skyLighting(JUST_BELOW_HORIZON_ALTITUDE, CLEAR_SKY)
    const atExtinctionLimit = skyLighting(EXTINCTION_LIMIT_ALTITUDE, CLEAR_SKY)
    const wellBelowExtinctionLimit = skyLighting(BELOW_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(justBelowHorizon.sunLevel).toBeGreaterThan(0)
    expect(atExtinctionLimit.sunLevel).toBe(0)
    expect(wellBelowExtinctionLimit.sunLevel).toBe(0)
  })

  it('never lets sunLevel increase as the sun descends through the horizon band', () => {
    let previousLevel = Number.POSITIVE_INFINITY
    for (const altitude of DESCENDING_ALTITUDES_THROUGH_HORIZON_BAND) {
      const { sunLevel } = skyLighting(altitude, CLEAR_SKY)
      expect(sunLevel).toBeLessThanOrEqual(previousLevel)
      previousLevel = sunLevel
    }
  })

  it('keeps the luminance of sunColor at 1 at every height, leaving the dimming to sunLevel', () => {
    for (const altitude of SUN_COLOR_SAMPLE_ALTITUDES) {
      const { sunColor } = skyLighting(altitude, CLEAR_SKY)
      expect(Math.abs(linearLuminance(sunColor) - SUN_COLOR_LUMINANCE)).toBeLessThan(
        SUN_COLOR_LUMINANCE_TOLERANCE,
      )
    }
  })

  it('tints the clear sky cooler than the direct sun', () => {
    const { sunColor, skyColor } = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    expect(blueFraction(skyColor)).toBeGreaterThan(blueFraction(sunColor))
  })

  it('pulls both sun and sky toward neutral grey as cloud cover thickens', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const overcast = skyLighting(MODERATE_SUN_ALTITUDE, HEAVY_OVERCAST)
    expect(channelSpread(overcast.sunColor)).toBeLessThan(channelSpread(clear.sunColor))
    expect(channelSpread(overcast.skyColor)).toBeLessThan(channelSpread(clear.skyColor))
  })

  it('never brightens the sky under overcast', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const overcast = skyLighting(MODERATE_SUN_ALTITUDE, HEAVY_OVERCAST)
    expect(luminance(overcast.skyColor)).toBeLessThanOrEqual(luminance(clear.skyColor))
  })

  it('extinguishes sunLevel once the sky is fully overcast', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const overcast = skyLighting(MODERATE_SUN_ALTITUDE, FULL_OVERCAST)
    expect(overcast.sunLevel).toBeLessThan(clear.sunLevel * OVERCAST_SUN_LEVEL_FRACTION_LIMIT)
  })

  it('never lets sunLevel rise as cloud cover thickens at a fixed altitude', () => {
    let previousLevel = Number.POSITIVE_INFINITY
    for (const cloudCover of ASCENDING_CLOUD_COVER_SEQUENCE) {
      const { sunLevel } = skyLighting(MODERATE_SUN_ALTITUDE, cloudCover)
      expect(sunLevel).toBeLessThan(previousLevel)
      previousLevel = sunLevel
    }
  })

  it('barely dims sunLevel under light cloud cover', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const lightCloud = skyLighting(MODERATE_SUN_ALTITUDE, LIGHT_CLOUD_COVER)
    expect(lightCloud.sunLevel).toBeGreaterThanOrEqual(
      clear.sunLevel * LIGHT_CLOUD_LEVEL_RETENTION_MINIMUM,
    )
  })
})
