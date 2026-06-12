import { describe, it, expect } from 'vitest'
import { DEFAULT_METRIC_PREFERENCES, formatAdaptiveLength } from '../../core'
import { segmentReadout, formatReadout } from './draw-readout'

describe('segmentReadout', () => {
  it('reports the length in millimetres and a zero bearing for a horizontal segment', () => {
    const readout = segmentReadout({ start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } })

    expect(readout.lengthMm).toBeCloseTo(3000, 5)
    expect(readout.bearingDeg).toBeCloseTo(0, 5)
  })

  it('normalizes a downward bearing into the half-open range [0, 360)', () => {
    const readout = segmentReadout({ start: { x: 0, y: 0 }, end: { x: 0, y: -1000 } })

    expect(readout.bearingDeg).toBeCloseTo(270, 5)
  })
})

describe('formatReadout', () => {
  it('composes the adaptive length and the rounded bearing with a degree sign', () => {
    expect(formatReadout({ lengthMm: 2400, bearingDeg: 45 }, DEFAULT_METRIC_PREFERENCES)).toBe(
      `${formatAdaptiveLength(2400, DEFAULT_METRIC_PREFERENCES)} 45°`,
    )
  })

  it('rounds the bearing to a whole number of degrees', () => {
    const text = formatReadout({ lengthMm: 2400, bearingDeg: 44.6 }, DEFAULT_METRIC_PREFERENCES)

    expect(text.endsWith('45°')).toBe(true)
  })
})
