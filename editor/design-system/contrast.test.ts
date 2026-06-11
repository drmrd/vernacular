import { describe, it, expect } from 'vitest'
import { contrastRatio, parseColor, relativeLuminance } from './contrast'

describe('contrast math', () => {
  it('parses #rrggbb, #rgb, and rgb() into channel values', () => {
    expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('rgb(26, 39, 56)')).toEqual({ r: 26, g: 39, b: 56 })
  })

  it('gives black zero luminance and white unit luminance', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })

  it('scores black on white at the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('scores a color against itself at 1:1 and is order-independent', () => {
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio('#2f2615', '#f4efe4')).toBeCloseTo(contrastRatio('#f4efe4', '#2f2615'), 5)
  })
})
