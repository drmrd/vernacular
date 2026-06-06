import { describe, expect, it } from 'vitest'
import { polygonArea } from './polygon'

describe('polygonArea', () => {
  it('returns the signed shoelace area, positive for counter-clockwise winding', () => {
    const counterClockwiseRectangle = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]

    expect(polygonArea(counterClockwiseRectangle)).toBe(12_000_000)
  })

  it('negates the signed area for clockwise winding of the same rectangle', () => {
    const clockwiseRectangle = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ]

    expect(polygonArea(clockwiseRectangle)).toBe(-12_000_000)
  })
})
