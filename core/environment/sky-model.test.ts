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
const BELOW_HORIZON_ALTITUDE = -0.2

const CLEAR_SKY = 0
const HEAVY_OVERCAST = 0.9

// Near-white means the brightest channel exceeds the dimmest by at most 15%.
const NEAR_WHITE_CHANNEL_RATIO = 1.15
// Below the horizon the direct sun should carry almost no luminance.
const EXTINGUISHED_SUN_LUMINANCE = 0.05

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

  it('extinguishes the direct sun below the horizon', () => {
    const { sunColor } = skyLighting(BELOW_HORIZON_ALTITUDE, CLEAR_SKY)
    expect(luminance(sunColor)).toBeLessThan(EXTINGUISHED_SUN_LUMINANCE)
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
})
