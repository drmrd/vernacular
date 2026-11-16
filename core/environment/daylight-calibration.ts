import { linearLuminance } from '../color/contrast'
import type { LinearRgb } from '../color/oklab'
import { referenceLightingInput } from './daylight-reference'
import { solarPosition } from './solar-position'
import { agxNeutralInverse } from './tone-response'

/*
 * The daylight calibration: three stated targets and the constants derived from them.
 * 1. The ratio of direct to diffuse light on a level card, a function of the sun's height.
 * 2. The white point: the color of sun plus sky on a level white card at the reference instant.
 * 3. The sunlit white level: at the reference instant a wall of reflectance 0.85 facing south
 *    returns the linear level that AgX at exposure 1 shows as the white code floor.
 * Every value on a level card is irradiance over pi, so a white card returns it as radiance.
 */

/** The lowest display code a sunlit white wall reads as white. */
export const WHITE_CODE_FLOOR = 225
/** The largest 8-bit display code. */
const DISPLAY_CODE_MAX = 255
/** The lux on the level card at the reference instant. */
export const REFERENCE_HORIZONTAL_ILLUMINANCE_LUX = 80_000

/** Fraction of full dome brightness that remained below the horizon before this calibration. */
const PREVIOUS_HORIZON_DOME_SCALE = 0.35
/** The luminance of the cosine-weighted mean of the previous dome's tints, rounded. */
const PREVIOUS_DOME_MEAN_LUMINANCE = 0.4445
/** The sky level on the level card with the sun at or below the horizon: the level of the previous dome there. */
export const NIGHT_DIFFUSE_LEVEL = PREVIOUS_HORIZON_DOME_SCALE * PREVIOUS_DOME_MEAN_LUMINANCE

const EIGHTH_TURN_DIVISOR = 4
/** The sun height, 45 degrees, at which the direct to diffuse ratio is stated as 5 to 1. */
const RATIO_STATED_HEIGHT = Math.PI / EIGHTH_TURN_DIVISOR
/** How far the direct to diffuse ratio rises above 1 at RATIO_STATED_HEIGHT, giving 5 to 1. */
const RATIO_RISE_AT_STATED_HEIGHT = 4

/** Direct sun tint with the sun on the horizon: strongly reddened by the long air path. */
const HORIZON_SUN_TINT: LinearRgb = { r: 1, g: 0.55, b: 0.25 }
/** Direct sun tint with the sun overhead: near-white with a faint residual warmth. */
const ZENITH_SUN_TINT: LinearRgb = { r: 1, g: 0.98, b: 0.95 }
/** Dome tint at the horizon: a dim, nearly grey band. */
const HORIZON_DOME_TINT: LinearRgb = { r: 0.45, g: 0.45, b: 0.5 }
/** Dome tint at the zenith: a saturated daytime blue, bluer than the horizon band. */
const ZENITH_DOME_TINT: LinearRgb = { r: 0.25, g: 0.45, b: 0.9 }

/** Fraction of full sun level that remains with the sun right on the horizon. */
const HORIZON_SUN_FRACTION = 0.35
/** Radians below the horizon over which direct sunlight fades to nothing. */
const HORIZON_EXTINCTION_RADIANS = 0.1
/**
 * Exponent of the Kasten-Czeplak direct-beam cloud transmission curve: convex, so light cloud
 * cover barely dims the direct sun while heavy cover extinguishes it by full overcast.
 */
const DIRECT_BEAM_CLOUD_EXPONENT = 3.4
/** Fraction of the diffuse level a fully overcast sky removes. */
const OVERCAST_DIFFUSE_DIMMING = 0.3
const RGB_CHANNEL_COUNT = 3

/**
 * The view height whose dome radiance equals the cosine-weighted mean of the upper dome. The dome
 * is linear in the view height y, and the mean of a + b y under the weight y over the hemisphere
 * is a + 2 b / 3: the ratio of the integrals of y squared and y over [0, 1]. The term toward the
 * sun integrates to zero over each ring, so it drops out.
 */
const HEIGHT_INTEGRAL_DENOMINATOR = 2
const HEIGHT_SQUARED_INTEGRAL_DENOMINATOR = 3
const COSINE_WEIGHTED_MEAN_HEIGHT =
  HEIGHT_INTEGRAL_DENOMINATOR / HEIGHT_SQUARED_INTEGRAL_DENOMINATOR

const referenceInput = referenceLightingInput()
/** The sun's height at the reference place and instant, computed rather than rounded to 45 degrees. */
const REFERENCE_SUN_ALTITUDE = solarPosition({
  latitude: referenceInput.latLong.latitude,
  longitude: referenceInput.latLong.longitude,
  observedAt: referenceInput.observedAt,
  utcOffsetMinutes: referenceInput.utcOffsetMinutes,
}).altitude

/** How many times brighter the clear horizon toward the reference sun is than the horizon away from it. */
const SUNWARD_HORIZON_RATIO = 3
/**
 * Strength of the dome's brightening toward the sun's azimuth. On the horizon under the reference
 * sun, (1 + gain cos h) / (1 - gain cos h) equals SUNWARD_HORIZON_RATIO.
 */
export const SUNWARD_GAIN =
  (SUNWARD_HORIZON_RATIO - 1) / ((SUNWARD_HORIZON_RATIO + 1) * Math.cos(REFERENCE_SUN_ALTITUDE))

/** Fixed-point steps of the white point solve; it settles to double precision well before this. */
const WHITE_POINT_ITERATION_COUNT = 50

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

function addLinearRgb(first: LinearRgb, second: LinearRgb): LinearRgb {
  return { r: first.r + second.r, g: first.g + second.g, b: first.b + second.b }
}

function divideLinearRgb(color: LinearRgb, divisor: LinearRgb): LinearRgb {
  return { r: color.r / divisor.r, g: color.g / divisor.g, b: color.b / divisor.b }
}

function withLuminance(color: LinearRgb, luminance: number): LinearRgb {
  return scaleLinearRgb(color, luminance / linearLuminance(color))
}

/** The grey a color flattens toward under cloud: its own channel mean. */
function greyOf(color: LinearRgb): LinearRgb {
  const mean = (color.r + color.g + color.b) / RGB_CHANNEL_COUNT
  return { r: mean, g: mean, b: mean }
}

function rawSunTint(sunAltitude: number): LinearRgb {
  return mixLinearRgb(HORIZON_SUN_TINT, ZENITH_SUN_TINT, clampToUnitInterval(Math.sin(sunAltitude)))
}

function rawDomeTint(viewHeight: number): LinearRgb {
  return mixLinearRgb(HORIZON_DOME_TINT, ZENITH_DOME_TINT, clampToUnitInterval(viewHeight))
}

/** The ratio of direct to diffuse light on a level card: 5 to 1 at 45 degrees, 1 to 1 at the horizon and below. */
export function directToDiffuseRatio(sunAltitude: number): number {
  return (
    1 +
    (RATIO_RISE_AT_STATED_HEIGHT * Math.max(0, Math.sin(sunAltitude))) /
      Math.sin(RATIO_STATED_HEIGHT)
  )
}

/**
 * The white point, at luminance 1. Divided by it, sun plus sky on the reference card is neutral.
 * With the sun and sky tints S and K and their level ratio R, the card's undivided color is
 * S t + K for the sun share t = R lum(K / W) / lum(S / W), and W is that color itself, so t is
 * a fixed point, found by iteration.
 */
function solveWhitePoint(): LinearRgb {
  const sunTint = rawSunTint(REFERENCE_SUN_ALTITUDE)
  const skyTint = rawDomeTint(COSINE_WEIGHTED_MEAN_HEIGHT)
  const levelRatio = directToDiffuseRatio(REFERENCE_SUN_ALTITUDE)
  let sunShare = levelRatio
  for (let step = 0; step < WHITE_POINT_ITERATION_COUNT; step += 1) {
    const white = addLinearRgb(scaleLinearRgb(sunTint, sunShare), skyTint)
    sunShare =
      (levelRatio * linearLuminance(divideLinearRgb(skyTint, white))) /
      linearLuminance(divideLinearRgb(sunTint, white))
  }
  return withLuminance(addLinearRgb(scaleLinearRgb(sunTint, sunShare), skyTint), 1)
}

const WHITE_POINT = solveWhitePoint()

/** A raw tint divided by the white point, then flattened toward grey under cloud. */
function whiteBalanced(color: LinearRgb, cloudCover: number): LinearRgb {
  const balanced = divideLinearRgb(color, WHITE_POINT)
  return mixLinearRgb(balanced, greyOf(balanced), clampToUnitInterval(cloudCover))
}

/**
 * The sun level overhead under a clear sky. The reference wall's level is linear in it, so it
 * was solved once with the scale at 1 (and the night floor set aside, which the reference sky
 * clears): the wall then returned a luminance of 0.169890, and the sunlit white level
 * 2.099829 / 0.169890 gives 12.3599.
 */
const SUN_SCALE = 12.3599

/** The fraction of the sun's level its height leaves: dimmer toward the horizon, gone just below it. */
function sunFade(sunAltitude: number): number {
  const elevation = clampToUnitInterval(Math.sin(sunAltitude))
  const extinction = clampToUnitInterval(1 + sunAltitude / HORIZON_EXTINCTION_RADIANS)
  return extinction * (HORIZON_SUN_FRACTION + (1 - HORIZON_SUN_FRACTION) * elevation)
}

/**
 * Fraction of the direct beam that reaches the ground through cloud cover, on a
 * Kasten-Czeplak-style convex curve: near 1 until cloud cover thickens, then 0 at full overcast.
 */
function directBeamCloudTransmission(cloudCover: number): number {
  return clampToUnitInterval(1 - clampToUnitInterval(cloudCover) ** DIRECT_BEAM_CLOUD_EXPONENT)
}

/** The direct sun's level, the engine's light intensity: the sun scale times the fade and the cloud transmission. */
export function sunLevelAt(sunAltitude: number, cloudCover: number): number {
  return SUN_SCALE * sunFade(sunAltitude) * directBeamCloudTransmission(cloudCover)
}

/** The direct sun's color: the raw tint divided by the white point, at luminance 1. */
export function sunColorAt(sunAltitude: number, cloudCover: number): LinearRgb {
  return withLuminance(whiteBalanced(rawSunTint(sunAltitude), cloudCover), 1)
}

/** The sky level on the level card: the clear direct level over the ratio, floored at night, dimmed by cloud. */
export function diffuseLevelAt(sunAltitude: number, cloudCover: number): number {
  const clearDirect = (sunLevelAt(sunAltitude, 0) * Math.max(0, Math.sin(sunAltitude))) / Math.PI
  const clearDiffuse = Math.max(
    clearDirect / directToDiffuseRatio(sunAltitude),
    NIGHT_DIFFUSE_LEVEL,
  )
  return clearDiffuse * (1 - OVERCAST_DIFFUSE_DIMMING * clampToUnitInterval(cloudCover))
}

/** The upper dome's radiance at the horizon and at the zenith; it blends linearly on the view height. */
export type UpperDomeTints = { horizon: LinearRgb; zenith: LinearRgb }

/** The upper dome's end tints, scaled so the dome's light on the level card is the diffuse level. */
export function upperDomeTints(sunAltitude: number, cloudCover: number): UpperDomeTints {
  const meanTint = whiteBalanced(rawDomeTint(COSINE_WEIGHTED_MEAN_HEIGHT), cloudCover)
  const domeScale = diffuseLevelAt(sunAltitude, cloudCover) / linearLuminance(meanTint)
  return {
    horizon: scaleLinearRgb(whiteBalanced(HORIZON_DOME_TINT, cloudCover), domeScale),
    zenith: scaleLinearRgb(whiteBalanced(ZENITH_DOME_TINT, cloudCover), domeScale),
  }
}

/** What a white level card returns from the sun and from the sky, each as irradiance over pi. */
export type LevelCardLight = { sun: LinearRgb; sky: LinearRgb }

/** The light on a level white card, in closed form over the upper dome. */
export function levelCardLight(sunAltitude: number, cloudCover: number): LevelCardLight {
  const sunOnCard =
    (sunLevelAt(sunAltitude, cloudCover) * Math.max(0, Math.sin(sunAltitude))) / Math.PI
  const dome = upperDomeTints(sunAltitude, cloudCover)
  return {
    sun: scaleLinearRgb(sunColorAt(sunAltitude, cloudCover), sunOnCard),
    sky: mixLinearRgb(dome.horizon, dome.zenith, COSINE_WEIGHTED_MEAN_HEIGHT),
  }
}

export type DaylightCalibration = {
  whitePoint: LinearRgb
  sunScale: number
  sunlitWhiteLevel: number
}

export const DAYLIGHT_CALIBRATION: DaylightCalibration = {
  whitePoint: WHITE_POINT,
  sunScale: SUN_SCALE,
  sunlitWhiteLevel: agxNeutralInverse(WHITE_CODE_FLOOR / DISPLAY_CODE_MAX),
}

const referenceCard = levelCardLight(REFERENCE_SUN_ALTITUDE, 0)
/** The photometric anchor: the lux that one unit of irradiance stands for, fixed by the reference card. */
export const LUX_PER_UNIT_IRRADIANCE =
  REFERENCE_HORIZONTAL_ILLUMINANCE_LUX /
  (Math.PI * linearLuminance(addLinearRgb(referenceCard.sun, referenceCard.sky)))
