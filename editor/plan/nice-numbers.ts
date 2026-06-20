/** Base of the decade the spacing snaps to; also the rollover step when the gap exceeds the 1-2-5 ratios. */
const DECADE_BASE = 10
/** The "5" rung of the 1-2-5 sequence; named so the multiplier table reads without a bare literal. */
const HALF_DECADE = 5
/** The 1-2-5 nice-number ratios within one decade, ascending. Gaps past the largest ratio roll over to the next decade via the `?? DECADE_BASE` fallback below. */
const NICE_MULTIPLIERS = [1, 2, HALF_DECADE] as const

/**
 * Smallest 1-2-5 nice number at or above `min`.
 *
 * Snaps `min` up to the nearest value of the form `m * 10^k` where `m` is one of
 * the 1-2-5 ratios. Both the grid spacing and the ruler label spacing climb
 * through this same ladder so their intervals stay visually consistent.
 */
export function nice125AtLeast(min: number): number {
  const magnitude = DECADE_BASE ** Math.floor(Math.log10(min))
  const normalized = min / magnitude // in [1, 10)
  const niceMultiplier = NICE_MULTIPLIERS.find((step) => normalized <= step) ?? DECADE_BASE
  return niceMultiplier * magnitude
}
