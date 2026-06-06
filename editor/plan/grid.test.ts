import { describe, it, expect } from 'vitest'
import { gridSpacingMm, GRID_MIN_LINE_SPACING_PX } from './grid'

describe('gridSpacingMm', () => {
  it('rounds up to a 1-2-5 nice number for the on-screen minimum gap', () => {
    // minimum world gap = GRID_MIN_LINE_SPACING_PX / scale, rounded up to 1-2-5 * 10^k
    expect(gridSpacingMm(0.1)).toBe(200) // 12 / 0.1 = 120 -> 200
    expect(gridSpacingMm(0.01)).toBe(2000) // 1200 -> 2000
    expect(gridSpacingMm(1)).toBe(20) // 12 -> 20
  })

  it('never returns a spacing whose on-screen size is below the minimum gap', () => {
    for (const scale of [0.002, 0.03, 0.08, 0.5, 4]) {
      expect(gridSpacingMm(scale) * scale).toBeGreaterThanOrEqual(GRID_MIN_LINE_SPACING_PX)
    }
  })
})
