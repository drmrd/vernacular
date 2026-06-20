import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  MM_PER_FOOT,
  formatLength,
  lengthFormatOptions,
} from '../../core'
import { rulerTicks, RULER_THICKNESS_PX, RULER_MIN_LABEL_GAP_PX } from './ruler'

// World-value step between each labelled tick and the one before it.
function consecutiveWorldSteps(worldValues: number[]): number[] {
  return worldValues.slice(1).map((value, index) => value - (worldValues[index] ?? 0))
}

describe('RULER_THICKNESS_PX', () => {
  it('reserves a positive band width for the ruler chrome', () => {
    expect(RULER_THICKNESS_PX).toBeGreaterThan(0)
  })
})

describe('rulerTicks', () => {
  it('labels ticks at the unit-nice label spacing so labels do not crowd along the horizontal axis', () => {
    // minWorld = 60 / 0.1 = 600 mm; the smallest 1-2-5 metric decade >= 600 is
    // 1000 mm, so labels snap to 1000 mm independent of the metric drawing grid.
    const ticks = rulerTicks(
      { scale: 0.1, offset: { x: 0, y: 0 } },
      100,
      'horizontal',
      DEFAULT_METRIC_PREFERENCES,
    )

    expect(ticks.map((tick) => tick.worldValue)).toEqual([0, 1000])
    expect(ticks.map((tick) => tick.label)).toEqual(['0 mm', '1000 mm'])
    expect(ticks.map((tick) => tick.screen)).toEqual([0, 100])
  })

  it('uses the vertical-axis offset for the unit-nice ruler ticks under pan', () => {
    const ticks = rulerTicks(
      { scale: 0.1, offset: { x: 0, y: -50 } },
      50,
      'vertical',
      DEFAULT_METRIC_PREFERENCES,
    )

    // visible world y is [-1000, -500]; the only multiple of 1000 in range is -1000
    expect(ticks.map((tick) => tick.worldValue)).toEqual([-1000])
  })

  it('keeps adjacent label screen positions at least the minimum gap apart across zoom levels', () => {
    for (const scale of [0.02, 0.05, 0.08, 0.2, 1]) {
      const ticks = rulerTicks(
        { scale, offset: { x: 0, y: 0 } },
        800,
        'horizontal',
        DEFAULT_METRIC_PREFERENCES,
      )

      for (let index = 1; index < ticks.length; index += 1) {
        const gap = (ticks[index]?.screen ?? 0) - (ticks[index - 1]?.screen ?? 0)
        expect(gap).toBeGreaterThanOrEqual(RULER_MIN_LABEL_GAP_PX)
      }
    }
  })

  it('spaces labelled ticks at the unit-nice label interval across zoom levels', () => {
    for (const scale of [0.02, 0.05, 0.08, 0.2, 1]) {
      const ticks = rulerTicks(
        { scale, offset: { x: 0, y: 0 } },
        800,
        'horizontal',
        DEFAULT_METRIC_PREFERENCES,
      )

      // Consecutive labelled ticks step by exactly one label interval; that
      // interval on screen clears the minimum gap. Difference-based to dodge
      // float modulo drift.
      const steps = consecutiveWorldSteps(ticks.map((tick) => tick.worldValue))
      const spacing = steps[0] ?? 0
      expect(spacing).toBeGreaterThan(0)
      expect(spacing * scale).toBeGreaterThanOrEqual(RULER_MIN_LABEL_GAP_PX)

      for (const step of steps) {
        expect(step).toBeCloseTo(spacing, 6)
      }
    }
  })

  it('snaps imperial labelled ticks to whole-foot intervals', () => {
    // At scale 0.05 the label spacing is 5 ft; every labelled tick must land on
    // an exact whole-foot boundary so labels read "0', 5', 10'" with no
    // fractional-inch tail. Division (float-safe) rather than `% MM_PER_FOOT`.
    const ticks = rulerTicks(
      { scale: 0.05, offset: { x: 0, y: 0 } },
      800,
      'horizontal',
      DEFAULT_IMPERIAL_PREFERENCES,
    )

    expect(ticks.length).toBeGreaterThan(1)
    for (const tick of ticks) {
      expect(Number.isInteger(tick.worldValue / MM_PER_FOOT)).toBe(true)
    }
  })

  it('formats tick labels in the active unit system', () => {
    const viewport = { scale: 0.1, offset: { x: 0, y: 0 } }

    const metricTicks = rulerTicks(viewport, 100, 'horizontal', DEFAULT_METRIC_PREFERENCES)
    const imperialTicks = rulerTicks(viewport, 100, 'horizontal', DEFAULT_IMPERIAL_PREFERENCES)

    const metricLabels = metricTicks.map((tick) => tick.label)
    const imperialLabels = imperialTicks.map((tick) => tick.label)

    // Metric formats the millimetre worldValues directly at 0 decimal places.
    expect(metricLabels).toEqual(['0 mm', '1000 mm'])

    // Imperial delegates to the units formatter, reading the same ticks in feet/inches.
    const expectedImperialLabels = imperialTicks.map((tick) =>
      formatLength(tick.worldValue, lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)),
    )
    expect(imperialLabels).toEqual(expectedImperialLabels)
    expect(imperialLabels).not.toEqual(metricLabels)

    // The unit system now drives BOTH the label AND the labelled-tick spacing:
    // imperial snaps to whole feet (2 ft = 609.6 mm) while metric snaps to a
    // 1-2-5 decade (1000 mm), so at scale 0.1 / lengthPx 100 their worldValues
    // diverge ([0, 609.6] vs [0, 1000]). Metric and imperial ticks therefore no
    // longer share geometry.
    expect(imperialTicks.map((tick) => tick.worldValue)).not.toEqual(
      metricTicks.map((tick) => tick.worldValue),
    )
  })
})
