import { describe, it, expect } from 'vitest'
import { DEFAULT_IMPERIAL_PREFERENCES, DEFAULT_METRIC_PREFERENCES, type Point } from '../../core'
import { segmentReadout, formatReadout } from './draw-readout'
import { dragReadout } from './drag-readout'

describe('dragReadout', () => {
  it('anchors the readout at the live point of the drag', () => {
    const from: Point = { x: 0, y: 0 }
    const to: Point = { x: 750, y: 1200 }

    expect(dragReadout(from, to, DEFAULT_METRIC_PREFERENCES).anchor).toEqual(to)
  })

  it('reads the from->to segment in the wall-tool length-and-bearing format', () => {
    const from: Point = { x: 0, y: 0 }
    const to: Point = { x: 1000, y: 0 }

    expect(dragReadout(from, to, DEFAULT_METRIC_PREFERENCES).text).toBe(
      formatReadout(segmentReadout({ start: from, end: to }), DEFAULT_METRIC_PREFERENCES),
    )
  })

  it('reflects a different from->to vector with a different bearing and unit preference', () => {
    const from: Point = { x: 500, y: 500 }
    const to: Point = { x: 500, y: 2000 }

    expect(dragReadout(from, to, DEFAULT_IMPERIAL_PREFERENCES).text).toBe(
      formatReadout(segmentReadout({ start: from, end: to }), DEFAULT_IMPERIAL_PREFERENCES),
    )
  })
})
