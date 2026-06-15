import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  feetToMillimeters,
} from '../../core'
import { scaleBar } from './scale-bar'

describe('scaleBar', () => {
  it('fills the target width when a round meter count fits it exactly', () => {
    // 100 px at 0.1 px/mm spans 1000 mm = 1 m, a round value that fits exactly.
    const bar = scaleBar(0.1, DEFAULT_METRIC_PREFERENCES, 100)

    expect(bar.lengthPx).toBe(100)
    expect(bar.label).toBe('1.00 m')
  })

  it('rounds down to the largest 1-2-5 value not exceeding the target width', () => {
    // 250 px at 0.1 px/mm spans 2.5 m; the nicest value that still fits is 2 m.
    const bar = scaleBar(0.1, DEFAULT_METRIC_PREFERENCES, 250)

    expect(bar.lengthPx).toBe(200)
    expect(bar.label).toBe('2.00 m')
  })

  it('drops to a sub-meter form when no whole meter fits', () => {
    // 40 px at 0.1 px/mm spans 0.4 m; the nicest value that fits is 0.2 m.
    const bar = scaleBar(0.1, DEFAULT_METRIC_PREFERENCES, 40)

    expect(bar.lengthPx).toBeCloseTo(20, 6)
    expect(bar.label).toBe('20.0 cm')
  })

  it('measures the bar in whole feet for an imperial project', () => {
    // 100 px at 0.1 px/mm spans about 3.28 ft; the nicest value that fits is 2 ft.
    const bar = scaleBar(0.1, DEFAULT_IMPERIAL_PREFERENCES, 100)

    expect(bar.lengthPx).toBeCloseTo(feetToMillimeters(2) * 0.1, 6)
    expect(bar.label).toBe("2'")
  })
})
