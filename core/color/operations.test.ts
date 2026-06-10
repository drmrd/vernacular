import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import { mixColors, nearestColor, perceptualDistance } from './operations'

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
})
