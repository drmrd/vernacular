import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  MM_PER_FOOT,
} from '../../core'
import { rulerLabelSpacingMm } from './ruler-label-spacing'
import { RULER_MIN_LABEL_GAP_PX } from './ruler'

// The 1-2-5 nice feet the imperial branch may land on; the spacing must be one
// of these multiplied by MM_PER_FOOT so labels read as whole feet ("0', 5', ...").
const NICE_FEET = [1, 2, 5, 10, 20, 50, 100, 200, 500]

describe('rulerLabelSpacingMm', () => {
  it('snaps imperial spacing to the smallest whole-foot 1-2-5 multiple that clears the label gap', () => {
    // minWorldMm = 60 / 0.05 = 1200 mm = 3.94 ft; smallest 1-2-5 nice feet >= 3.94 is 5 ft.
    const spacing = rulerLabelSpacingMm(DEFAULT_IMPERIAL_PREFERENCES, 0.05)

    expect(spacing).toBe(5 * MM_PER_FOOT)
    expect(spacing % MM_PER_FOOT).toBe(0)
    expect(NICE_FEET).toContain(spacing / MM_PER_FOOT)
  })

  it('rolls imperial spacing up to the next nice foot count at a coarser zoom', () => {
    // minWorldMm = 60 / 0.01 = 6000 mm = 19.69 ft; smallest 1-2-5 nice feet >= 19.69 is 20 ft.
    const spacing = rulerLabelSpacingMm(DEFAULT_IMPERIAL_PREFERENCES, 0.01)

    expect(spacing).toBe(20 * MM_PER_FOOT)
    expect(spacing % MM_PER_FOOT).toBe(0)
    expect(NICE_FEET).toContain(spacing / MM_PER_FOOT)
  })

  it('snaps metric spacing to the smallest 1-2-5 decade of millimetres that clears the label gap', () => {
    // minWorldMm = 60 / 0.1 = 600 mm; smallest 1-2-5 decade of mm >= 600 is 1000.
    const spacing = rulerLabelSpacingMm(DEFAULT_METRIC_PREFERENCES, 0.1)

    expect(spacing).toBe(1000)
  })

  it('keeps the on-screen label gap at least RULER_MIN_LABEL_GAP_PX wide across zoom levels', () => {
    for (const scale of [0.02, 0.05, 0.1, 0.5, 1]) {
      expect(
        rulerLabelSpacingMm(DEFAULT_METRIC_PREFERENCES, scale) * scale,
      ).toBeGreaterThanOrEqual(RULER_MIN_LABEL_GAP_PX)
      expect(
        rulerLabelSpacingMm(DEFAULT_IMPERIAL_PREFERENCES, scale) * scale,
      ).toBeGreaterThanOrEqual(RULER_MIN_LABEL_GAP_PX)
    }
  })
})
