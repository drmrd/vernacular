import { linearToSrgb, srgbToOkLab, type LinearRgb } from '../color/oklab'

/** The least chroma a low sun's light must keep, so it still reads as warm and not as grey. */
export const LOW_SUN_CHROMA_MINIMUM = 0.01

/** The clear-sky optical depth of the direct sun, as the calibration records it. */
export const SUN_OPTICAL_DEPTH_RECORDED = 0.21

/** The sun scale, the level of a sun at the zenith, frozen to four decimals for this fade. */
export const FROZEN_SUN_SCALE = 10.9126

const HALF_TURN_IN_DEGREES = 180
const DEGREES_PER_RADIAN = HALF_TURN_IN_DEGREES / Math.PI
const ZENITH = Math.PI / 2
const KASTEN_YOUNG_COEFFICIENT = 0.50572
const KASTEN_YOUNG_OFFSET_DEGREES = 6.07995
const KASTEN_YOUNG_EXPONENT = 1.6364

/** Scales so the largest channel is 1, encodes to sRGB, and returns the OKLab color. */
export function shadeOf(color: LinearRgb): { a: number; b: number; chroma: number } {
  const largest = Math.max(color.r, color.g, color.b)
  const lab = srgbToOkLab({
    r: linearToSrgb(color.r / largest),
    g: linearToSrgb(color.g / largest),
    b: linearToSrgb(color.b / largest),
  })
  return { a: lab.a, b: lab.b, chroma: Math.hypot(lab.a, lab.b) }
}

/**
 * The relative air mass of Kasten and Young (1989) for a sun at the given height in radians:
 * 1 / (sin h + 0.50572 (h in degrees + 6.07995) ^ -1.6364). It is 0.99971 at the zenith and
 * stays finite, about 37.92, as the sun reaches the horizon.
 */
export function kastenYoungAirMass(height: number): number {
  const degrees = height * DEGREES_PER_RADIAN
  const correction =
    KASTEN_YOUNG_COEFFICIENT * (degrees + KASTEN_YOUNG_OFFSET_DEGREES) ** -KASTEN_YOUNG_EXPONENT
  return 1 / (Math.sin(height) + correction)
}

/**
 * The fraction of the sun scale a sun at the given height keeps: exp(-0.21 (m(h) - m(zenith)))
 * with m the Kasten and Young air mass, so exactly 1 at the zenith, and 0 at and below the
 * horizon.
 */
export function kastenYoungFade(height: number): number {
  if (height <= 0) return 0
  const extraAirMass = kastenYoungAirMass(height) - kastenYoungAirMass(ZENITH)
  return Math.exp(-SUN_OPTICAL_DEPTH_RECORDED * extraAirMass)
}
