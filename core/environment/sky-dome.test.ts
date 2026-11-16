import { describe, expect, it } from 'vitest'
import { referenceLightingInput } from './daylight-reference'
import { computeEnvironmentLighting } from './environment-lighting'
import { GROUND_SURFACE_COLOR } from './ground-surface'
import { skyDomeRadiance, type SkyDomeInput } from './sky-dome'
import { solarPosition } from './solar-position'
import { linearToSrgb, type LinearRgb } from '../color/oklab'
import { linearLuminance, relativeLuminance } from '../color/contrast'
import type { Vector3 } from '../scene/vector3'

// The analytic sky dome extends skyLighting's single averaged ambient tint into a
// view-direction-dependent radiance field. These tests pin down relational facts
// only, in the same style as sky-model.test.ts: view elevations and sun altitudes
// are radians (negative altitude is below the horizon; negative view elevation
// looks at the ground). Cloud cover runs 0 (clear) to 1 (overcast). The sun is a
// unit world-frame direction; the helpers below aim it along +x at a given altitude
// and aim views along +z, a quarter turn from the sun, so the term that brightens the
// dome toward the sun drops out of the cases that are not about it.

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

// With the sun at the zenith the ground, lit by the sun, is brighter than the zenith sky
// (about 1.6 times by the plan's arithmetic).
const GROUND_TO_ZENITH_RATIO_MINIMUM = 1.3
const GROUND_TO_ZENITH_RATIO_MAXIMUM = 2.0

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

// A tolerance for relations that hold exactly in the model and differ only by rounding.
const EXACT_TOLERANCE = 1e-6
const AZIMUTH_TOLERANCE_DECIMALS = 10

// Numeric quadrature of the upper dome: midpoint steps in the view's height (the cosine of
// the polar angle, so a step has equal solid angle and the cosine weight is the height itself)
// times a multiple of four of evenly spaced azimuths, so a term that varies as the cosine of
// the azimuth cancels to rounding.
const HEIGHT_STEPS = 400
const AZIMUTH_STEPS = 64
const QUADRATURE_TOLERANCE = 1e-5

// The sun's clear-sky level card light is checked at one cloud cover that is neither clear
// nor overcast, and with the sun just below the horizon.
const PARTLY_CLOUDY = 0.5
const SUN_BELOW_HORIZON_ALTITUDE = -0.2

const OVERCAST = 1
const WHITE: LinearRgb = { r: 1, g: 1, b: 1 }
const NO_SUN_LEVEL = 0
const THIRTY_DEGREES = Math.PI / 6
const FORTY_FIVE_DEGREES = Math.PI / 4

// The ratio the brightening gain is derived from: the horizon toward the sun is three times as
// bright as the horizon away from it when the sun stands at the reference height.
const TOWARD_TO_AWAY_RATIO = 3

function sunAlong(azimuth: number, altitude: number): Vector3 {
  return {
    x: Math.cos(altitude) * Math.cos(azimuth),
    y: Math.sin(altitude),
    z: Math.cos(altitude) * Math.sin(azimuth),
  }
}

function sunAt(altitude: number): SkyDomeInput {
  return { sunDirection: sunAlong(0, altitude), cloudCover: CLEAR_SKY }
}

function viewAt(elevation: number): Vector3 {
  return { x: 0, y: Math.sin(elevation), z: Math.cos(elevation) }
}

function referenceSunAltitude(): number {
  const input = referenceLightingInput()
  return solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  }).altitude
}

function level(color: LinearRgb): number {
  return linearLuminance(color)
}

/** The cosine-weighted mean radiance of the upper dome: what a level card collects from the sky, over pi. */
function upperDomeMean(sky: SkyDomeInput): LinearRgb {
  const sum = { r: 0, g: 0, b: 0 }
  let weight = 0
  for (let heightIndex = 0; heightIndex < HEIGHT_STEPS; heightIndex += 1) {
    const height = (heightIndex + 0.5) / HEIGHT_STEPS
    const ring = Math.sqrt(1 - height * height)
    for (let azimuthIndex = 0; azimuthIndex < AZIMUTH_STEPS; azimuthIndex += 1) {
      const azimuth = (2 * Math.PI * (azimuthIndex + 0.5)) / AZIMUTH_STEPS
      const view = { x: ring * Math.cos(azimuth), y: height, z: ring * Math.sin(azimuth) }
      const radiance = skyDomeRadiance(view, sky)
      sum.r += radiance.r * height
      sum.g += radiance.g * height
      sum.b += radiance.b * height
      weight += height
    }
  }
  return { r: sum.r / weight, g: sum.g / weight, b: sum.b / weight }
}

function expectColorsClose(actual: LinearRgb, expected: LinearRgb, tolerance: number): void {
  expect(Math.abs(actual.r - expected.r)).toBeLessThan(tolerance)
  expect(Math.abs(actual.g - expected.g)).toBeLessThan(tolerance)
  expect(Math.abs(actual.b - expected.b)).toBeLessThan(tolerance)
}

function expectColorsEqual(actual: LinearRgb, expected: LinearRgb): void {
  expect(actual.r).toBeCloseTo(expected.r, AZIMUTH_TOLERANCE_DECIMALS)
  expect(actual.g).toBeCloseTo(expected.g, AZIMUTH_TOLERANCE_DECIMALS)
  expect(actual.b).toBeCloseTo(expected.b, AZIMUTH_TOLERANCE_DECIMALS)
}

/** What a level white card returns from the sun and the sky, times the lawn it lights. */
function lawnUnderLight(sunColor: LinearRgb, sunLevel: number, sky: SkyDomeInput): LinearRgb {
  const sunUp = Math.max(0, sky.sunDirection.y)
  const sunScale = (sunLevel * sunUp) / Math.PI
  const skyMean = upperDomeMean(sky)
  return {
    r: GROUND_SURFACE_COLOR.r * (sunColor.r * sunScale + skyMean.r),
    g: GROUND_SURFACE_COLOR.g * (sunColor.g * sunScale + skyMean.g),
    b: GROUND_SURFACE_COLOR.b * (sunColor.b * sunScale + skyMean.b),
  }
}

describe('skyDomeRadiance', () => {
  it('renders the zenith bluer than the horizon under a high clear sun', () => {
    const zenith = skyDomeRadiance(viewAt(ZENITH_VIEW_ELEVATION), sunAt(HIGH_SUN_ALTITUDE))
    const horizon = skyDomeRadiance(viewAt(HORIZON_VIEW_ELEVATION), sunAt(HIGH_SUN_ALTITUDE))
    expect(blueFraction(zenith)).toBeGreaterThan(blueFraction(horizon))
  })

  it('dims every view direction monotonically as the sun sets', () => {
    for (const viewElevation of SAMPLE_VIEW_ELEVATIONS) {
      let previousLuminance = Number.POSITIVE_INFINITY
      for (const sunAltitude of DESCENDING_SUN_ALTITUDES) {
        const radiance = skyDomeRadiance(viewAt(viewElevation), sunAt(sunAltitude))
        expect(luminance(radiance)).toBeLessThanOrEqual(previousLuminance)
        previousLuminance = luminance(radiance)
      }
    }
  })

  it('pulls a view direction toward grey under cloud cover without ever brightening it', () => {
    const clear = skyDomeRadiance(viewAt(ZENITH_VIEW_ELEVATION), sunAt(MODERATE_SUN_ALTITUDE))
    const overcast = skyDomeRadiance(viewAt(ZENITH_VIEW_ELEVATION), {
      ...sunAt(MODERATE_SUN_ALTITUDE),
      cloudCover: HEAVY_OVERCAST,
    })
    expect(channelSpread(overcast)).toBeLessThan(channelSpread(clear))
    expect(luminance(overcast)).toBeLessThanOrEqual(luminance(clear))
  })

  it('returns a ground between 1.3 and 2.0 times as bright as the zenith with the sun at the zenith', () => {
    const zenith = skyDomeRadiance(viewAt(ZENITH_VIEW_ELEVATION), sunAt(HIGH_SUN_ALTITUDE))
    const ground = skyDomeRadiance(viewAt(GROUND_VIEW_ELEVATION), sunAt(HIGH_SUN_ALTITUDE))
    const ratio = level(ground) / level(zenith)
    expect(ratio).toBeGreaterThan(GROUND_TO_ZENITH_RATIO_MINIMUM)
    expect(ratio).toBeLessThan(GROUND_TO_ZENITH_RATIO_MAXIMUM)
  })

  it('makes the horizon toward the sun three times as bright as the horizon away from it at the reference height', () => {
    const sky = sunAt(referenceSunAltitude())
    const toward = skyDomeRadiance({ x: 1, y: 0, z: 0 }, sky)
    const away = skyDomeRadiance({ x: -1, y: 0, z: 0 }, sky)
    expect(Math.abs(level(toward) / level(away) - TOWARD_TO_AWAY_RATIO)).toBeLessThan(
      EXACT_TOLERANCE,
    )
  })

  it('returns the same radiance overhead whatever the sun azimuth', () => {
    const altitude = referenceSunAltitude()
    const overhead = { x: 0, y: 1, z: 0 }
    const reference = skyDomeRadiance(overhead, sunAt(altitude))
    for (const azimuth of [FORTY_FIVE_DEGREES, Math.PI, -THIRTY_DEGREES]) {
      const turned = { sunDirection: sunAlong(azimuth, altitude), cloudCover: CLEAR_SKY }
      expectColorsEqual(skyDomeRadiance(overhead, turned), reference)
    }
  })

  it('returns the same radiance at every view azimuth under full overcast', () => {
    const sky = { sunDirection: sunAlong(0, referenceSunAltitude()), cloudCover: OVERCAST }
    const elevation = THIRTY_DEGREES
    const reference = skyDomeRadiance({ x: Math.cos(elevation), y: Math.sin(elevation), z: 0 }, sky)
    for (const azimuth of [FORTY_FIVE_DEGREES, Math.PI, -THIRTY_DEGREES]) {
      const view = {
        x: Math.cos(elevation) * Math.cos(azimuth),
        y: Math.sin(elevation),
        z: Math.cos(elevation) * Math.sin(azimuth),
      }
      expectColorsEqual(skyDomeRadiance(view, sky), reference)
    }
  })

  it('collects the same light from the upper dome for a sun toward +x and a sun toward -z', () => {
    const altitude = referenceSunAltitude()
    const towardX = upperDomeMean({ sunDirection: sunAlong(0, altitude), cloudCover: CLEAR_SKY })
    const towardMinusZ = upperDomeMean({
      sunDirection: sunAlong(-Math.PI / 2, altitude),
      cloudCover: CLEAR_SKY,
    })
    expectColorsClose(towardX, towardMinusZ, EXACT_TOLERANCE)
  })

  it('returns the lawn times the light on a level card for a view below the horizon', () => {
    const lighting = computeEnvironmentLighting(referenceLightingInput())
    const sky = { sunDirection: lighting.sunDirection, cloudCover: lighting.cloudCover }
    const expected = lawnUnderLight(lighting.sunColor, lighting.sunLevel, sky)
    for (const view of [
      { x: 0, y: -1, z: 0 },
      { x: 0.6, y: -0.8, z: 0 },
      { x: -0.3, y: -0.4, z: 0.866 },
    ]) {
      expectColorsClose(skyDomeRadiance(view, sky), expected, QUADRATURE_TOLERANCE)
    }
  })

  it('returns the lawn times the sky alone for a view below the horizon once the sun has set', () => {
    const sky = { sunDirection: sunAlong(0, SUN_BELOW_HORIZON_ALTITUDE), cloudCover: PARTLY_CLOUDY }
    const expected = lawnUnderLight(WHITE, NO_SUN_LEVEL, sky)
    const ground = skyDomeRadiance({ x: 0, y: -1, z: 0 }, sky)
    expectColorsClose(ground, expected, QUADRATURE_TOLERANCE)
  })
})
