import { describe, it, expect } from 'vitest'
import { rulerTicks, RULER_THICKNESS_PX } from './ruler'

describe('RULER_THICKNESS_PX', () => {
  it('reserves a positive band width for the ruler chrome', () => {
    expect(RULER_THICKNESS_PX).toBeGreaterThan(0)
  })
})

describe('rulerTicks', () => {
  it('places ticks at the grid spacing with raw-millimetre labels along the horizontal axis', () => {
    const ticks = rulerTicks({ scale: 0.1, offset: { x: 0, y: 0 } }, 100, 'horizontal')

    expect(ticks.map((tick) => tick.worldValue)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(ticks.map((tick) => tick.label)).toEqual(['0', '200', '400', '600', '800', '1000'])
    expect(ticks[0]?.screen).toBe(0)
  })

  it('uses the vertical-axis offset for vertical ruler ticks under pan', () => {
    const ticks = rulerTicks({ scale: 0.1, offset: { x: 0, y: -50 } }, 50, 'vertical')

    // visible world y is [500, 1000]; ticks at multiples of 200 within it
    expect(ticks.map((tick) => tick.worldValue)).toEqual([600, 800, 1000])
  })
})
