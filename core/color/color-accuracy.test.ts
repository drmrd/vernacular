import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  withinColorTolerance,
} from './color-accuracy'

describe('color-accuracy swatches and tolerance', () => {
  it('defines the three named swatches used by the color-accuracy gate', () => {
    expect(COLOR_ACCURACY_SWATCHES.map((swatch) => swatch.color.srgbHex)).toEqual([
      '#808080',
      '#cc6633',
      '#3f7f5f',
    ])
    for (const swatch of COLOR_ACCURACY_SWATCHES) {
      expect(swatch.name.length).toBeGreaterThan(0)
    }
  })

  it('reports a color within tolerance of itself', () => {
    const gray = colorFromHex('#808080')
    expect(withinColorTolerance(gray, gray)).toBe(true)
  })

  it('reports a color out of tolerance of an unrelated hue', () => {
    expect(withinColorTolerance(colorFromHex('#cc6633'), colorFromHex('#3f7f5f'))).toBe(false)
  })

  it('reports a color out of tolerance of a much darker value', () => {
    expect(withinColorTolerance(colorFromHex('#808080'), colorFromHex('#3a3a3a'))).toBe(false)
  })

  it('honors an explicit tolerance argument', () => {
    const reference = colorFromHex('#808080')
    const sample = colorFromHex('#8a8a8a')
    expect(withinColorTolerance(sample, reference, 0)).toBe(false)
    expect(withinColorTolerance(sample, reference, 1)).toBe(true)
  })

  it('defines a positive default tolerance', () => {
    expect(COLOR_ACCURACY_TOLERANCE).toBeGreaterThan(0)
  })
})
