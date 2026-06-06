export const GRID_MIN_LINE_SPACING_PX = 12

/** Base of the decade the spacing snaps to. */
const DECADE_BASE = 10
/** The "5" rung of the 1-2-5 sequence; named so the multiplier table reads without a bare literal. */
const HALF_DECADE = 5
/** Ascending 1-2-5 multipliers within a decade; the chosen step is the smallest one whose product with its decade covers the minimum gap. */
const NICE_MULTIPLIERS = [1, 2, HALF_DECADE, DECADE_BASE] as const

/** Smallest 1-2-5 nice number whose on-screen size (`spacing * scale`) is at least `GRID_MIN_LINE_SPACING_PX`. */
export function gridSpacingMm(scale: number): number {
  const minWorld = GRID_MIN_LINE_SPACING_PX / scale
  const magnitude = DECADE_BASE ** Math.floor(Math.log10(minWorld))
  const normalized = minWorld / magnitude // in [1, 10)
  const niceMultiplier = NICE_MULTIPLIERS.find((step) => normalized <= step) ?? DECADE_BASE
  return niceMultiplier * magnitude
}
