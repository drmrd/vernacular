import { describe, expect, it } from 'vitest'
import { skyDomeRadiance } from './sky-dome'
import { skyLighting } from './sky-model'
import { linearToSrgb, type LinearRgb } from '../color/oklab'
import { relativeLuminance } from '../color/contrast'

// The analytic sky dome extends skyLighting's single averaged ambient tint into a
// view-direction-dependent radiance field. These tests pin down relational facts
// only, in the same style as sky-model.test.ts: view elevations and sun altitudes
// are radians (negative altitude is below the horizon; negative view elevation
// looks at the ground). Cloud cover runs 0 (clear) to 1 (overcast).

const ZENITH_VIEW_ELEVATION = Math.PI / 2
const HORIZON_VIEW_ELEVATION = 0
const GROUND_VIEW_ELEVATION = -Math.PI / 2

const HIGH_SUN_ALTITUDE = Math.PI / 2
const MODERATE_SUN_ALTITUDE = 0.7

const CLEAR_SKY = 0
const HEAVY_OVERCAST = 0.9

// The sun altitudes a setting sun passes through, in order, from high overhead
// to well below the horizon.
const DESCENDING_SUN_ALTITUDES = [
  Math.PI / 2,
  1.0,
  0.5,
  0.2,
  0.1,
  0.05,
  0,
  -0.02,
  -0.05,
  -0.1,
  -0.2,
]

// A representative sample of view directions: straight up, at the horizon, and
// straight down at the ground.
const SAMPLE_VIEW_ELEVATIONS = [
  ZENITH_VIEW_ELEVATION,
  HORIZON_VIEW_ELEVATION,
  GROUND_VIEW_ELEVATION,
]

// Loose cross-model check: the dome's horizon radiance need only land within
// this factor of skyLighting's ambient luminance, so the two models can each
// evolve their own tuning without silently drifting apart.
const AMBIENT_FAMILY_LUMINANCE_FACTOR = 2

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

describe('skyDomeRadiance', () => {
  it('renders the zenith bluer than the horizon under a high clear sun', () => {
    const zenith = skyDomeRadiance(ZENITH_VIEW_ELEVATION, HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const horizon = skyDomeRadiance(HORIZON_VIEW_ELEVATION, HIGH_SUN_ALTITUDE, CLEAR_SKY)
    expect(blueFraction(zenith)).toBeGreaterThan(blueFraction(horizon))
  })

  it('dims every view direction monotonically as the sun sets', () => {
    for (const viewElevation of SAMPLE_VIEW_ELEVATIONS) {
      let previousLuminance = Number.POSITIVE_INFINITY
      for (const sunAltitude of DESCENDING_SUN_ALTITUDES) {
        const radiance = skyDomeRadiance(viewElevation, sunAltitude, CLEAR_SKY)
        expect(luminance(radiance)).toBeLessThanOrEqual(previousLuminance)
        previousLuminance = luminance(radiance)
      }
    }
  })

  it('pulls a view direction toward grey under cloud cover without ever brightening it', () => {
    const clear = skyDomeRadiance(ZENITH_VIEW_ELEVATION, MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const overcast = skyDomeRadiance(ZENITH_VIEW_ELEVATION, MODERATE_SUN_ALTITUDE, HEAVY_OVERCAST)
    expect(channelSpread(overcast)).toBeLessThan(channelSpread(clear))
    expect(luminance(overcast)).toBeLessThanOrEqual(luminance(clear))
  })

  it('returns a ground tint dimmer than the zenith under a high sun for a below-horizon view', () => {
    const zenith = skyDomeRadiance(ZENITH_VIEW_ELEVATION, HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const ground = skyDomeRadiance(GROUND_VIEW_ELEVATION, HIGH_SUN_ALTITUDE, CLEAR_SKY)
    expect(luminance(ground)).toBeLessThan(luminance(zenith))
  })

  it('keeps the horizon-level dome in the same ambient family as the sky model', () => {
    const domeAtHorizon = skyDomeRadiance(HORIZON_VIEW_ELEVATION, MODERATE_SUN_ALTITUDE, CLEAR_SKY)
    const ambient = skyLighting(MODERATE_SUN_ALTITUDE, CLEAR_SKY).skyColor
    const domeLuminance = luminance(domeAtHorizon)
    const ambientLuminance = luminance(ambient)
    expect(domeLuminance).toBeLessThanOrEqual(ambientLuminance * AMBIENT_FAMILY_LUMINANCE_FACTOR)
    expect(domeLuminance).toBeGreaterThanOrEqual(ambientLuminance / AMBIENT_FAMILY_LUMINANCE_FACTOR)
  })
})
