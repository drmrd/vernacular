import { describe, expect, it } from 'vitest'
import { formatHex, parseHex } from './hex'

describe('hex parsing and formatting', () => {
  it('parses #rrggbb into 0..1 sRGB channels', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('expands #rgb shorthand', () => {
    expect(parseHex('#fff')).toEqual({ r: 1, g: 1, b: 1 })
  })

  it('formats sRGB back to lowercase #rrggbb', () => {
    expect(formatHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff')
    expect(formatHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
  })

  it('throws on a malformed hex string', () => {
    expect(() => parseHex('not-a-color')).toThrow()
  })
})
