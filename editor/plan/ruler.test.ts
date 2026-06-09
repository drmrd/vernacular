import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  formatLength,
  lengthFormatOptions,
} from '../../core'
import { rulerTicks, RULER_THICKNESS_PX, RULER_MIN_LABEL_GAP_PX } from './ruler'
import { gridSpacingMm } from './grid'

describe('RULER_THICKNESS_PX', () => {
  it('reserves a positive band width for the ruler chrome', () => {
    expect(RULER_THICKNESS_PX).toBeGreaterThan(0)
  })
})

describe('rulerTicks', () => {
  it('labels ticks at a coarser grid-aligned spacing so labels do not crowd along the horizontal axis', () => {
    // gridSpacing is 200 mm (20 px at 0.1 px/mm); labelEvery = ceil(60 / 20) = 3,
    // so labels are emitted every 600 mm to keep adjacent labels >= 60 px apart.
    const ticks = rulerTicks(
      { scale: 0.1, offset: { x: 0, y: 0 } },
      100,
      'horizontal',
      DEFAULT_METRIC_PREFERENCES,
    )

    expect(ticks.map((tick) => tick.worldValue)).toEqual([0, 600])
    expect(ticks.map((tick) => tick.label)).toEqual(['0 mm', '600 mm'])
    expect(ticks.map((tick) => tick.screen)).toEqual([0, 60])
  })

  it('uses the vertical-axis offset for the coarser ruler ticks under pan', () => {
    const ticks = rulerTicks(
      { scale: 0.1, offset: { x: 0, y: -50 } },
      50,
      'vertical',
      DEFAULT_METRIC_PREFERENCES,
    )

    // visible world y is [500, 1000]; the only multiple of 600 in range is 600
    expect(ticks.map((tick) => tick.worldValue)).toEqual([600])
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

  it('keeps every labelled tick aligned to a grid line across zoom levels', () => {
    for (const scale of [0.02, 0.05, 0.08, 0.2, 1]) {
      const ticks = rulerTicks(
        { scale, offset: { x: 0, y: 0 } },
        800,
        'horizontal',
        DEFAULT_METRIC_PREFERENCES,
      )
      const spacing = gridSpacingMm(scale)

      for (const tick of ticks) {
        expect(tick.worldValue % spacing).toBe(0)
      }
    }
  })

  it('formats tick labels in the active unit system', () => {
    const viewport = { scale: 0.1, offset: { x: 0, y: 0 } }

    const metricTicks = rulerTicks(viewport, 100, 'horizontal', DEFAULT_METRIC_PREFERENCES)
    const imperialTicks = rulerTicks(viewport, 100, 'horizontal', DEFAULT_IMPERIAL_PREFERENCES)

    const metricLabels = metricTicks.map((tick) => tick.label)
    const imperialLabels = imperialTicks.map((tick) => tick.label)

    // Metric formats the millimetre worldValues directly at 0 decimal places.
    expect(metricLabels).toEqual(['0 mm', '600 mm'])

    // Imperial delegates to the units formatter, reading the same ticks in feet/inches.
    const expectedImperialLabels = imperialTicks.map((tick) =>
      formatLength(tick.worldValue, lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)),
    )
    expect(imperialLabels).toEqual(expectedImperialLabels)
    expect(imperialLabels).not.toEqual(metricLabels)

    // Only the label changes with the units; the world and screen geometry is identical.
    expect(imperialTicks.map((tick) => tick.worldValue)).toEqual(
      metricTicks.map((tick) => tick.worldValue),
    )
    expect(imperialTicks.map((tick) => tick.screen)).toEqual(metricTicks.map((tick) => tick.screen))
  })
})
