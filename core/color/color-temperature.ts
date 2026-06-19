import { srgbToLinear, type LinearRgb, type Srgb } from './oklab'

/** The supported color-temperature band (design specification 6.7). */
export const MIN_COLOR_TEMPERATURE_K = 2700
export const MAX_COLOR_TEMPERATURE_K = 6500
/** The neutral default: near-white daylight, so the scene opens close to the prior white baseline. */
export const DEFAULT_COLOR_TEMPERATURE_K = 6500

const SRGB_8BIT_SCALE = 255

function clampChannel(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/* eslint-disable no-magic-numbers -- Tanner Helland's published blackbody-to-sRGB
   approximation coefficients (the 100 scale, the 66/60/19 breakpoints, and the per-channel
   fit constants); a documented fit, not unexplained numbers. */
function redChannel(t: number): number {
  return t <= 66 ? SRGB_8BIT_SCALE : 329.698727446 * (t - 60) ** -0.1332047592
}

function greenChannel(t: number): number {
  return t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * (t - 60) ** -0.0755148492
}

function blueChannel(t: number): number {
  if (t >= 66) return SRGB_8BIT_SCALE
  if (t <= 19) return 0
  return 138.5177312231 * Math.log(t - 10) - 305.0447927307
}
/* eslint-enable no-magic-numbers */

/** Maps a scaled color temperature to a clamped 0..1 sRGB triple via the Helland fit. */
function blackbodyToSrgb(t: number): Srgb {
  return {
    r: clampChannel(redChannel(t) / SRGB_8BIT_SCALE),
    g: clampChannel(greenChannel(t) / SRGB_8BIT_SCALE),
    b: clampChannel(blueChannel(t) / SRGB_8BIT_SCALE),
  }
}

/**
 * Converts a color temperature in kelvin to a linear-light color for a physically
 * shaded renderer. The input is clamped to the supported band, and the output is
 * normalized so the brightest channel is one, so warming the light changes its hue
 * without dimming the scene.
 */
export function kelvinToLinearRgb(kelvin: number): LinearRgb {
  const clamped = Math.min(MAX_COLOR_TEMPERATURE_K, Math.max(MIN_COLOR_TEMPERATURE_K, kelvin))
  const t = clamped / 100
  const srgb = blackbodyToSrgb(t)
  const linear = { r: srgbToLinear(srgb.r), g: srgbToLinear(srgb.g), b: srgbToLinear(srgb.b) }
  const peak = Math.max(linear.r, linear.g, linear.b)
  return { r: linear.r / peak, g: linear.g / peak, b: linear.b / peak }
}

/** Formats a color temperature in kelvin as a readable value string with its unit, e.g. `'6500 K'`. */
export function formatColorTemperature(kelvin: number): string {
  return `${kelvin} K`
}

const COLOR_TEMPERATURE_MIDPOINT_K = (MIN_COLOR_TEMPERATURE_K + MAX_COLOR_TEMPERATURE_K) / 2

/** Describes a color temperature in kelvin as `'warm'` (low end) or `'cool'` (high end). */
export function colorTemperatureLabel(kelvin: number): 'warm' | 'cool' {
  return kelvin < COLOR_TEMPERATURE_MIDPOINT_K ? 'warm' : 'cool'
}
