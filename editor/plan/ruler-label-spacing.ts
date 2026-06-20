import { MM_PER_FOOT, type UnitPreferences } from '../../core'
import { RULER_MIN_LABEL_GAP_PX } from './ruler'

/** Base of the decade the spacing snaps to; also the rollover step when the gap exceeds the 1-2-5 ratios. */
const DECADE_BASE = 10
/** The "5" rung of the 1-2-5 sequence; named so the multiplier table reads without a bare literal. */
const HALF_DECADE = 5
/** The 1-2-5 nice-number ratios within one decade, ascending. Gaps past the largest ratio roll over to the next decade via the `?? DECADE_BASE` fallback below. */
const NICE_MULTIPLIERS = [1, 2, HALF_DECADE] as const

/**
 * Smallest 1-2-5 nice number at or above `min`. Mirrors `gridSpacingMm`'s
 * routine so the labeled spacing climbs through the same 1-2-5 ladder.
 */
function nice125AtLeast(min: number): number {
  const magnitude = DECADE_BASE ** Math.floor(Math.log10(min))
  const normalized = min / magnitude // in [1, 10)
  const niceMultiplier = NICE_MULTIPLIERS.find((step) => normalized <= step) ?? DECADE_BASE
  return niceMultiplier * magnitude
}

/**
 * Spacing in millimetres between labeled ruler ticks, snapped to a 1-2-5 nice
 * multiple of the active unit and at least `RULER_MIN_LABEL_GAP_PX` wide on
 * screen.
 *
 * The labeled spacing snaps to unit-nice intervals so the values a reader sees
 * are round in their own unit: imperial labels land on whole feet (5 ft, 20 ft)
 * rather than on metric-grid multiples that would read as odd foot fractions.
 * This deliberately differs from `gridSpacingMm`, which always snaps to a metric
 * 1-2-5 decade of millimetres regardless of the active unit.
 *
 * @param scale viewport zoom in pixels per millimetre (px/mm)
 */
export function rulerLabelSpacingMm(preferences: UnitPreferences, scale: number /* px/mm */): number {
  const minWorldMm = RULER_MIN_LABEL_GAP_PX / scale
  if (preferences.system === 'metric') {
    return nice125AtLeast(minWorldMm)
  }
  return nice125AtLeast(minWorldMm / MM_PER_FOOT) * MM_PER_FOOT
}
