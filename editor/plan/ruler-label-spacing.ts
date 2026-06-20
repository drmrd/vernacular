import { MM_PER_FOOT, type UnitPreferences } from '../../core'
import { nice125AtLeast } from './nice-numbers'
import { RULER_MIN_LABEL_GAP_PX } from './ruler'

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
