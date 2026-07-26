import { colorFromHex, type Color, type NamedColor } from './color'
import { perceptualDistance } from './operations'

/**
 * The three known mid-range paint swatches the color-accuracy gate renders and
 * samples (design spec `2026-07-26-decorating-color-accuracy-gate`, "The swatch
 * matrix"): a neutral mid-gray that catches white-balance drift, and a warm and
 * a cool saturated color that catch an illuminant double-tint on either side of
 * neutral. The warm and cool colors reuse the two colors the shipped
 * `paint=demo` harness mode already paints, so the matrix stays grounded in
 * colors the project has rendered before. All three sit in the tone-mapping
 * operator's roughly linear mid-range; near-white and near-black are
 * deliberately out of scope.
 */
export const COLOR_ACCURACY_SWATCHES: readonly NamedColor[] = [
  { name: 'Neutral mid-gray', color: colorFromHex('#808080') },
  { name: 'Warm saturated', color: colorFromHex('#cc6633') },
  { name: 'Cool saturated', color: colorFromHex('#3f7f5f') },
]

/**
 * The pass tolerance for the color-accuracy gate, expressed as a maximum OKLab
 * `perceptualDistance` between a rendered sample and its reference swatch. This
 * value is provisional: it is the starting expectation from the design spec
 * ("The tolerance"), not yet the measured cross-backend spread. It is replaced
 * by the empirically measured ceiling, derivation recorded in ADR-0157, once
 * the neutral-gray round-trip is sampled on both render backends.
 */
export const COLOR_ACCURACY_TOLERANCE = 0.05

/**
 * Whether a sampled color reads as its reference swatch: the OKLab
 * `perceptualDistance` between the two is at or under the given tolerance
 * (default `COLOR_ACCURACY_TOLERANCE`). Used by the color-accuracy gate to
 * judge a rendered sample against a known swatch without asserting exact
 * pixels.
 */
export function withinColorTolerance(
  sample: Color,
  reference: Color,
  tolerance: number = COLOR_ACCURACY_TOLERANCE,
): boolean {
  return perceptualDistance(sample, reference) <= tolerance
}
