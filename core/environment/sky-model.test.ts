import { describe, expect, it } from 'vitest'
import { skyLighting } from './sky-model'
import { linearToSrgb, type LinearRgb } from '../color/oklab'
import { relativeLuminance } from '../color/contrast'

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
// Full overcast must leave at most this fraction of the clear-sky sunIntensity,
// so the direct beam (and the crisp shadows it casts) is effectively gone.
const OVERCAST_SUN_INTENSITY_FRACTION_LIMIT = 0.05
// Light cloud must keep at least this fraction of the clear-sky sunIntensity,
// pinning the convex attenuation curve's mild low-cloud-cover response.
const LIGHT_CLOUD_INTENSITY_RETENTION_MINIMUM = 0.9

// Near-white means the brightest channel exceeds the dimmest by at most 15%.
const NEAR_WHITE_CHANNEL_RATIO = 1.15
// Full sun intensity, and (coincidentally) the horizon tint's saturated red channel.
const FULL_SUN_INTENSITY = 1
// Fraction of full sun intensity the design documents for the sun exactly on the horizon.
const HORIZON_SUN_INTENSITY_FRACTION = 0.35

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

function summedIntensity(color: LinearRgb): number {
  return color.r + color.g + color.b
}

function blueFraction(color: LinearRgb): number {
  return color.b / summedIntensity(color)
}

describe('skyLighting', () => {
  it('renders the high clear-sky sun near white and brighter than the horizon sun', () => {
    const highSun = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY).sunColor
    const horizonSun = skyLighting(HORIZON_SUN_ALTITUDE, CLEAR_SKY).sunColor
    const brightestChannel = Math.max(highSun.r, highSun.g, highSun.b)
    const dimmestChannel = Math.min(highSun.r, highSun.g, highSun.b)
    expect(brightestChannel).toBeLessThanOrEqual(dimmestChannel * NEAR_WHITE_CHANNEL_RATIO)
    expect(luminance(highSun)).toBeGreaterThan(luminance(horizonSun))
  })

  it('warms and dims the direct sun at the horizon', () => {
    const horizonSun = skyLighting(HORIZON_SUN_ALTITUDE, CLEAR_SKY).sunColor
    const highSun = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY).sunColor
    expect(horizonSun.r).toBeGreaterThan(horizonSun.b)
    expect(summedIntensity(horizonSun)).toBeLessThan(summedIntensity(highSun))
  })

  it('reaches full sunIntensity at the zenith and 0.35 of full sun exactly on the horizon', () => {
    const zenith = skyLighting(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const horizon = skyLighting(ON_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(zenith.sunIntensity).toBe(FULL_SUN_INTENSITY)
    expect(horizon.sunIntensity).toBeCloseTo(HORIZON_SUN_INTENSITY_FRACTION, 5)
  })

  it('extinguishes sunIntensity once the sun passes the extinction limit below the horizon', () => {
    const justBelowHorizon = skyLighting(JUST_BELOW_HORIZON_ALTITUDE, CLEAR_SKY)
    const atExtinctionLimit = skyLighting(EXTINCTION_LIMIT_ALTITUDE, CLEAR_SKY)
    const wellBelowExtinctionLimit = skyLighting(BELOW_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(justBelowHorizon.sunIntensity).toBeGreaterThan(0)
    expect(atExtinctionLimit.sunIntensity).toBe(0)
    expect(wellBelowExtinctionLimit.sunIntensity).toBe(0)
  })

  it('never lets sunIntensity increase as the sun descends through the horizon band', () => {
    let previousIntensity = Number.POSITIVE_INFINITY
    for (const altitude of DESCENDING_ALTITUDES_THROUGH_HORIZON_BAND) {
      const { sunIntensity } = skyLighting(altitude, CLEAR_SKY)
      expect(sunIntensity).toBeLessThanOrEqual(previousIntensity)
      previousIntensity = sunIntensity
    }
  })

  it('keeps sunColor at full strength on the horizon, leaving the dimming to sunIntensity', () => {
    const { sunColor } = skyLighting(ON_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(sunColor.r).toBeCloseTo(FULL_SUN_INTENSITY, 5)
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

  it('extinguishes sunIntensity once the sky is fully overcast', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const overcast = skyLighting(MODERATE_SUN_ALTITUDE, FULL_OVERCAST)
    expect(overcast.sunIntensity).toBeLessThan(
      clear.sunIntensity * OVERCAST_SUN_INTENSITY_FRACTION_LIMIT,
    )
  })

  it('never lets sunIntensity rise as cloud cover thickens at a fixed altitude', () => {
    let previousIntensity = Number.POSITIVE_INFINITY
    for (const cloudCover of ASCENDING_CLOUD_COVER_SEQUENCE) {
      const { sunIntensity } = skyLighting(MODERATE_SUN_ALTITUDE, cloudCover)
      expect(sunIntensity).toBeLessThan(previousIntensity)
      previousIntensity = sunIntensity
    }
  })

  it('barely dims sunIntensity under light cloud cover', () => {
    const clear = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const lightCloud = skyLighting(MODERATE_SUN_ALTITUDE, LIGHT_CLOUD_COVER)
    expect(lightCloud.sunIntensity).toBeGreaterThanOrEqual(
      clear.sunIntensity * LIGHT_CLOUD_INTENSITY_RETENTION_MINIMUM,
    )
  })
})
