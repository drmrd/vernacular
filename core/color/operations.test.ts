import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import { mixColors, nearestColor, oklabChroma, perceptualDistance } from './operations'
import { oklabChroma as BARREL_oklabChroma } from '../index'

describe('perceptual color operations', () => {
  it('mixes two colors at a perceptual midpoint in OKLab', () => {
    const mid = mixColors(colorFromHex('#000000'), colorFromHex('#ffffff'), 0.5)
    expect(mid.oklab.L).toBeGreaterThan(0)
    expect(mid.oklab.L).toBeLessThan(1)
  })

  it('reports zero distance to itself and positive distance to a different color', () => {
    const blue = colorFromHex('#336699')
    expect(perceptualDistance(blue, blue)).toBeCloseTo(0, 6)
    expect(perceptualDistance(blue, colorFromHex('#ffffff'))).toBeGreaterThan(0)
  })

  it('finds the nearest candidate color by perceptual distance', () => {
    const candidates = [colorFromHex('#000000'), colorFromHex('#ffffff'), colorFromHex('#346599')]
    expect(nearestColor(colorFromHex('#336699'), candidates)?.srgbHex).toBe('#346599')
  })

  it('reports zero chroma for achromatic grays', () => {
    expect(oklabChroma(colorFromHex('#080808'))).toBeCloseTo(0, 6)
    expect(oklabChroma(colorFromHex('#808080'))).toBeCloseTo(0, 6)
  })

  it('reports the OKLab chroma of the six-LSB blue cast from ADR-0168', () => {
    expect(oklabChroma(colorFromHex('#08080e'))).toBeCloseTo(0.0134, 4)
  })

  it('re-exports oklabChroma from the core barrel', () => {
    expect(BARREL_oklabChroma).toBeDefined()
    expect(BARREL_oklabChroma).toBe(oklabChroma)
  })
})
