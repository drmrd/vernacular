import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import { referenceLightingInput } from './daylight-reference'
import { GROUND_SURFACE_COLOR } from './ground-surface'
import { skyLighting } from './sky-model'
import { solarPosition } from './solar-position'

/** The sky the dome is drawn for: a unit world-frame direction toward the sun, and the cloud cover. */
export type SkyDomeInput = { sunDirection: Vector3; cloudCover: number }

/** Dome tint at the horizon: a dim, nearly grey band, matching the sky model's ambient. */
const HORIZON_DOME_TINT: LinearRgb = { r: 0.45, g: 0.45, b: 0.5 }
/** Dome tint at the zenith: a saturated daytime blue, bluer than the horizon band. */
const ZENITH_DOME_TINT: LinearRgb = { r: 0.25, g: 0.45, b: 0.9 }
/** Fraction of full dome brightness that remains once the sun reaches the horizon. */
const HORIZON_DOME_SCALE = 0.35
/** Fraction of dome brightness a fully overcast sky removes, alongside flattening it toward grey. */
const OVERCAST_DOME_DIMMING = 0.3
// Mirrors sky-model.ts's private RGB-blend helpers; kept private on purpose so the two models can tune independently.
const RGB_CHANNEL_COUNT = 3

/** How many times brighter the clear horizon toward the reference sun is than the horizon away from it. */
const SUNWARD_HORIZON_RATIO = 3
const referenceInput = referenceLightingInput()
/** The sun's height at the reference place and instant, computed rather than rounded to 45 degrees. */
const REFERENCE_SUN_ALTITUDE = solarPosition({
  latitude: referenceInput.latLong.latitude,
  longitude: referenceInput.latLong.longitude,
  observedAt: referenceInput.observedAt,
  utcOffsetMinutes: referenceInput.utcOffsetMinutes,
}).altitude
/**
 * Strength of the brightening toward the sun's azimuth. On the horizon under the reference sun,
 * (1 + gain cos h) / (1 - gain cos h) equals SUNWARD_HORIZON_RATIO.
 */
const SUNWARD_GAIN =
  (SUNWARD_HORIZON_RATIO - 1) / ((SUNWARD_HORIZON_RATIO + 1) * Math.cos(REFERENCE_SUN_ALTITUDE))
/**
 * The view height whose radiance equals the cosine-weighted mean of the upper dome. The dome is
 * linear in the view height y, and the mean of a + b y under the weight y over the hemisphere is
 * a + 2 b / 3: the ratio of the integrals of y squared and y over [0, 1]. The term toward the
 * sun integrates to zero over each ring, so it drops out.
 */
const HEIGHT_INTEGRAL_DENOMINATOR = 2
const HEIGHT_SQUARED_INTEGRAL_DENOMINATOR = 3
const COSINE_WEIGHTED_MEAN_HEIGHT =
  HEIGHT_INTEGRAL_DENOMINATOR / HEIGHT_SQUARED_INTEGRAL_DENOMINATOR

function clampToUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function mixLinearRgb(from: LinearRgb, to: LinearRgb, fraction: number): LinearRgb {
  return {
    r: from.r + (to.r - from.r) * fraction,
    g: from.g + (to.g - from.g) * fraction,
    b: from.b + (to.b - from.b) * fraction,
  }
}

function scaleLinearRgb(color: LinearRgb, factor: number): LinearRgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor }
}

/** The grey a color flattens toward under cloud: its own channel mean. */
function greyOf(color: LinearRgb): LinearRgb {
  const mean = (color.r + color.g + color.b) / RGB_CHANNEL_COUNT
  return { r: mean, g: mean, b: mean }
}

/** Clouds scatter dome light toward grey and absorb some of it outright. */
function overcastAdjustedDome(color: LinearRgb, cloudCover: number): LinearRgb {
  const flattened = mixLinearRgb(color, greyOf(color), cloudCover)
  return scaleLinearRgb(flattened, 1 - OVERCAST_DOME_DIMMING * cloudCover)
}

/** The sun's height above the horizon in radians, from its unit direction. */
function sunAltitudeOf(sky: SkyDomeInput): number {
  return Math.asin(Math.min(1, Math.max(-1, sky.sunDirection.y)))
}

/** The upper dome at a view height, before the brightening toward the sun's azimuth. */
function domeAtHeight(viewHeight: number, sky: SkyDomeInput): LinearRgb {
  const sunElevationFraction = clampToUnitInterval(Math.sin(sunAltitudeOf(sky)))
  const domeScale = HORIZON_DOME_SCALE + (1 - HORIZON_DOME_SCALE) * sunElevationFraction
  const baseTint = mixLinearRgb(
    HORIZON_DOME_TINT,
    ZENITH_DOME_TINT,
    clampToUnitInterval(viewHeight),
  )
  return overcastAdjustedDome(scaleLinearRgb(baseTint, domeScale), sky.cloudCover)
}

function upperDomeRadiance(view: Vector3, sky: SkyDomeInput): LinearRgb {
  const { sunDirection } = sky
  const sunwardAlignment = view.x * sunDirection.x + view.z * sunDirection.z
  const brightening = 1 + SUNWARD_GAIN * (1 - sky.cloudCover) * sunwardAlignment
  return scaleLinearRgb(domeAtHeight(view.y, sky), brightening)
}

/**
 * The lawn under the light a level card receives: the direct sun's irradiance over pi plus the
 * cosine-weighted mean of the upper dome. The sun color and level come from the sky model, the
 * same values the environment lighting hands the engine.
 */
function groundRadiance(sky: SkyDomeInput): LinearRgb {
  const { sunColor, sunLevel } = skyLighting(sunAltitudeOf(sky), sky.cloudCover)
  const sunIrradianceOverPi = (sunLevel * Math.max(0, sky.sunDirection.y)) / Math.PI
  const skyMean = domeAtHeight(COSINE_WEIGHTED_MEAN_HEIGHT, sky)
  return {
    r: GROUND_SURFACE_COLOR.r * (sunColor.r * sunIrradianceOverPi + skyMean.r),
    g: GROUND_SURFACE_COLOR.g * (sunColor.g * sunIrradianceOverPi + skyMean.g),
    b: GROUND_SURFACE_COLOR.b * (sunColor.b * sunIrradianceOverPi + skyMean.b),
  }
}

/**
 * Radiance of the analytic sky dome in a unit view direction (y up), as linear-light sRGB.
 * Above the horizon (y at or above 0) the dome blends a horizon tint into a zenith tint on the
 * view height, dims as the sun sets, flattens toward grey under cloud, and brightens toward the
 * sun's azimuth under a clear sky. Below the horizon it returns the lawn lit by the sun and the
 * upper dome.
 */
export function skyDomeRadiance(view: Vector3, sky: SkyDomeInput): LinearRgb {
  return view.y >= 0 ? upperDomeRadiance(view, sky) : groundRadiance(sky)
}
