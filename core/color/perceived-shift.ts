import type { Color } from './color'
import { COLOR_ACCURACY_TOLERANCE, withinColorTolerance } from './color-accuracy'
import { perceptualDistance } from './operations'

/**
 * How a sampled color reads against a reference swatch, in the same terms a
 * person describes a repaint: overall closeness, plus which direction it
 * drifted on the two axes a human eye actually notices. This is what lets a
 * readout say a sample "reads as painted" for a shift the color-accuracy gate
 * (`withinColorTolerance`, `COLOR_ACCURACY_TOLERANCE`) would already accept,
 * instead of surfacing a bare distance number.
 */
export interface PerceivedShift {
  readonly distance: number
  readonly faithful: boolean
  readonly lightness: 'lighter' | 'darker' | 'unchanged'
  readonly warmth: 'warmer' | 'cooler' | 'unchanged'
}

/** The number of OKLab axes (L, a, b) `perceptualDistance` combines. */
const OKLAB_AXIS_COUNT = 3

/**
 * The per-axis share of the color-accuracy gate's isotropic tolerance ball.
 *
 * `COLOR_ACCURACY_TOLERANCE` bounds the total OKLab `perceptualDistance`,
 * which combines all three axes (L, a, b) as a Euclidean norm. A shift spread
 * evenly across all three axes therefore reaches the tolerance boundary when
 * each axis sits at `COLOR_ACCURACY_TOLERANCE / Math.sqrt(3)`: three such
 * per-axis deltas combine via `Math.hypot` to exactly `COLOR_ACCURACY_TOLERANCE`.
 * This is a derived constant, not a tuned one, so classifying a single axis'
 * delta against it stays consistent with the gate's own pass/fail boundary.
 */
export const PERCEIVED_AXIS_THRESHOLD = COLOR_ACCURACY_TOLERANCE / Math.sqrt(OKLAB_AXIS_COUNT)

/**
 * Classify a signed delta against the axis threshold, in the given
 * direction labels for a positive and a negative delta. Both `lightness`
 * and `warmth` are the same symmetric three-way comparison, just against
 * different OKLab components and direction words.
 */
function classifyAxis<Positive extends string, Negative extends string>(
  delta: number,
  positiveDirection: Positive,
  negativeDirection: Negative,
): Positive | Negative | 'unchanged' {
  if (delta > PERCEIVED_AXIS_THRESHOLD) {
    return positiveDirection
  }
  if (delta < -PERCEIVED_AXIS_THRESHOLD) {
    return negativeDirection
  }
  return 'unchanged'
}

/**
 * Describe how a sampled color reads against a reference swatch: the overall
 * perceptual distance, whether that distance is within the color-accuracy
 * gate's tolerance, and which way the sample drifted on lightness (OKLab L)
 * and warmth (OKLab b, the blue-yellow axis). A drift under the per-axis
 * threshold on a given axis reads as `'unchanged'` on that axis even when the
 * two colors are not byte-identical, matching how a person would describe
 * the swatch: close enough that they would not call it lighter, darker,
 * warmer, or cooler.
 */
export function describePerceivedShift(sample: Color, reference: Color): PerceivedShift {
  return {
    distance: perceptualDistance(sample, reference),
    // Delegates to the color-accuracy gate's own predicate rather than
    // re-deriving the `<=` comparison here: `faithful` means "the gate would
    // accept this render", so the two must stay structurally in agreement
    // even if the gate's tolerance or comparison rule changes later.
    faithful: withinColorTolerance(sample, reference),
    lightness: classifyAxis(sample.oklab.L - reference.oklab.L, 'lighter', 'darker'),
    warmth: classifyAxis(sample.oklab.b - reference.oklab.b, 'warmer', 'cooler'),
  }
}

/**
 * Phrases a `PerceivedShift` as the short label a readout prints beside a
 * sampled swatch. The axis values are already the exact words the phrase
 * needs (`'lighter'`, `'darker'`, `'warmer'`, `'cooler'`), so this reads them
 * straight off the shift instead of re-deriving them with a lookup table.
 */
export function perceivedShiftLabel(shift: PerceivedShift): string {
  if (shift.faithful) {
    return 'Reads as painted'
  }
  const movedAxes = [shift.lightness, shift.warmth].filter((axis) => axis !== 'unchanged')
  if (movedAxes.length === 0) {
    // Neither lightness nor warmth crossed its threshold, yet the shift is
    // not faithful: the drift lives entirely on the OKLab a axis (green to
    // pink), which has no phrase of its own. Say something honest rather
    // than claim the paint reads as chosen.
    return 'Reads slightly different'
  }
  return `Reads ${movedAxes.join(' and ')}`
}
