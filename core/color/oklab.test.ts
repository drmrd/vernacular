import { describe, expect, it } from 'vitest'
import { okLabToSrgb, srgbToOkLab } from './oklab'

const EPSILON = 1e-6

describe('srgb and oklab conversions', () => {
  it('round-trips an sRGB color through OKLab within tolerance', () => {
    const srgb = { r: 0.5, g: 0.5, b: 0.5 }
    const back = okLabToSrgb(srgbToOkLab(srgb))
    expect(back.r).toBeCloseTo(srgb.r, 5)
    expect(back.g).toBeCloseTo(srgb.g, 5)
    expect(back.b).toBeCloseTo(srgb.b, 5)
  })

  it('maps white to lightness near one with near-zero chroma', () => {
    const white = srgbToOkLab({ r: 1, g: 1, b: 1 })
    expect(white.L).toBeCloseTo(1, 2)
    expect(Math.abs(white.a)).toBeLessThan(1e-3)
    expect(Math.abs(white.b)).toBeLessThan(1e-3)
  })

  it('maps black to lightness near zero', () => {
    expect(srgbToOkLab({ r: 0, g: 0, b: 0 }).L).toBeLessThan(EPSILON)
  })
})
