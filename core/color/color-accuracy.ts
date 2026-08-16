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
 * `perceptualDistance` between a rendered sample and its reference swatch.
 *
 * Measured, not guessed (design spec "The tolerance"; ADR-0157). The three
 * swatches were rendered on the shell floor under the color-check reference
 * condition and sampled on both render backends the project uses. The sampled
 * distances were byte-identical across darwin Metal and linux SwiftShader (zero
 * cross-backend spread, the harness render is deterministic): warm 0.0271, gray
 * 0.0409, cool 0.0447. The tolerance is the observed maximum (0.0447) plus a
 * margin for future render drift, rounded to 0.06. This sits at a few
 * just-noticeable differences, so a real hue error or gross value error fails
 * while the expected lit-floor value offset passes.
 */
export const COLOR_ACCURACY_TOLERANCE = 0.06

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

/**
 * A swatch in the tone-map-extreme tier (issue #512, ADR-0168). Unlike
 * NamedColor, the reference is not always the paint color: near-black's
 * pass reference is its pinned measured render, not its own albedo, so
 * paint and reference are tracked separately. neutralHue marks a swatch
 * whose render must stay achromatic, letting the gate add a chroma check
 * on top of the OKLab distance check.
 */
export interface ToneMapExtremeSwatch {
  name: string
  paint: Color
  reference: Color
  neutralHue: boolean
}

/**
 * The tone-map-extreme tier of the color-accuracy gate (issue #512): the
 * near-white and near-black swatches the mid-range tier above deliberately
 * excludes, covering the tone-mapping operator's shoulder and toe. Measured
 * on the color-check reference condition (scene=color-accuracy, neutral
 * lighting, PBR Neutral, exposure 1), byte-identical across darwin Metal and
 * linux SwiftShader, five runs per swatch, perfectly uniform 24px sample
 * patches. Near-white keeps the raw-albedo reference: #f0f0ea renders
 * #e9e9e3, an OKLab distance of 0.0211 from its own albedo, so the
 * raw-albedo promise holds at the white end. Near-black breaks the round
 * trip: #262626 renders #080808, an OKLab distance of 0.1342 from its
 * albedo (the operator subtracts a fixed 0.04 pedestal and quadratically
 * crushes below min-channel 0.08 linear), so the reference is the pinned
 * measured render #080808, not the paint. A renderer or rig change that
 * moves the render moves the pin by design; re-pin in the same change.
 */
export const TONE_MAP_EXTREME_SWATCHES: readonly ToneMapExtremeSwatch[] = [
  {
    name: 'Near-white',
    paint: colorFromHex('#f0f0ea'),
    reference: colorFromHex('#f0f0ea'),
    neutralHue: false,
  },
  {
    name: 'Near-black',
    paint: colorFromHex('#262626'),
    reference: colorFromHex('#080808'),
    neutralHue: true,
  },
]

/**
 * The pass tolerance for the tone-map-extreme tier, expressed as a maximum
 * OKLab `perceptualDistance` between a rendered sample and its reference.
 *
 * Derived, not guessed (issue #512, ADR-0168): round-up-to-2-decimals of
 * max(0.0211 measured near-white distance, 0.0104 two-LSB quantization
 * floor at the #080808 pin) plus the 0.0153 drift margin the mid-range
 * precedent established (0.06 tolerance minus 0.0447 observed max) =
 * round-up-2dp(0.0364) = 0.04. Deliberately tighter than
 * COLOR_ACCURACY_TOLERANCE (0.06) because the near-black reference is a
 * pinned render, not a raw albedo, so the expected distance at the pin is
 * near zero.
 */
export const TONE_MAP_EXTREME_TOLERANCE = 0.04

/**
 * The maximum allowed OKLab chroma (hypot of oklab.a and oklab.b) for a
 * sample of a `neutralHue` tone-map-extreme swatch.
 *
 * Measured chroma at the near-black render is exactly 0 on both backends; a
 * 2-LSB single-channel excursion measures 0.0047 (passes), a 6-LSB blue
 * shift (#08080e) measures 0.0134 (fails). Catches an illuminant tint the
 * distance check alone could miss inside a 0.04 ball (issue #512,
 * ADR-0168).
 */
export const TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND = 0.01
