import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import { parseHex } from './hex'
import { srgbToOkLab } from './oklab'

describe('color value', () => {
  it('derives a consistent OKLab canonical form from a hex string', () => {
    const color = colorFromHex('#336699')
    expect(color.srgbHex).toBe('#336699')
    expect(color.oklab).toEqual(srgbToOkLab(parseHex('#336699')))
    expect(color.originalSpec).toBeUndefined()
  })

  it('carries an optional original-spec source identifier', () => {
    expect(colorFromHex('#336699', 'Heritage Blue 12').originalSpec).toBe('Heritage Blue 12')
  })

  it('maps white to a near-one lightness', () => {
    expect(colorFromHex('#ffffff').oklab.L).toBeCloseTo(1, 2)
  })
})
