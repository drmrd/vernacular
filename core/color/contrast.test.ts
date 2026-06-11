import { describe, it, expect } from 'vitest'
import { contrastRatio, relativeLuminance } from './contrast'

describe('relativeLuminance', () => {
  it('gives black zero luminance and white unit luminance', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('scores black on white at the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('scores a color against itself at 1:1', () => {
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    expect(contrastRatio('#2f2615', '#f4efe4')).toBeCloseTo(contrastRatio('#f4efe4', '#2f2615'), 5)
  })

  it('rejects a malformed color rather than scoring it silently', () => {
    expect(() => contrastRatio('not-a-color', '#ffffff')).toThrow()
  })
})
