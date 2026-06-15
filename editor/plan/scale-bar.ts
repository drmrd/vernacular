import { MM_PER_FOOT, MM_PER_METER, formatAdaptiveLength, type UnitPreferences } from '../../core'

/** A scale-bar segment: its on-screen width and the formatted distance it spans. */
export interface ScaleBarSegment {
  lengthPx: number
  label: string
}

const DECADE = 10
// A scale bar reads cleanly only at 1, 2, or 5 times a power of ten; these are the
// two larger per-decade steps, checked largest first so the first that fits wins.
const NICE_LARGE_STEP = 5
const NICE_MID_STEP = 2

/**
 * The largest 1-2-5 x 10^n value not exceeding `value` (which must be positive) -
 * the "nice" round number a scale bar reads cleanly as (3.28 -> 2, 0.4 -> 0.2).
 */
function niceFloor(value: number): number {
  const magnitude = Math.pow(DECADE, Math.floor(Math.log10(value)))
  const fraction = value / magnitude
  if (fraction >= NICE_LARGE_STEP) {
    return NICE_LARGE_STEP * magnitude
  }
  if (fraction >= NICE_MID_STEP) {
    return NICE_MID_STEP * magnitude
  }
  return magnitude
}

/**
 * The scale-bar segment for the current zoom: a round distance in the project's
 * display unit (feet for imperial, meters for metric) whose on-screen width is the
 * largest 1/2/5 x 10^n value not exceeding `targetPx`, paired with its formatted
 * label. `scale` is the viewport's pixels-per-millimeter.
 */
export function scaleBar(
  scale: number,
  preferences: UnitPreferences,
  targetPx: number,
): ScaleBarSegment {
  const unitMm = preferences.system === 'imperial' ? MM_PER_FOOT : MM_PER_METER
  const targetUnits = targetPx / scale / unitMm
  const distanceMm = niceFloor(targetUnits) * unitMm
  return { lengthPx: distanceMm * scale, label: formatAdaptiveLength(distanceMm, preferences) }
}
