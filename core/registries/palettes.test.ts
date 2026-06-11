import { describe, expect, it } from 'vitest'
import { PALETTE_REGISTRY_VERSION, builtinPalettes } from './palettes'
import { srgbToOkLab } from '../color/oklab'
import { parseHex } from '../color/hex'

describe('builtin palettes', () => {
  it('seeds at least one bundled palette with the registry version', () => {
    expect(builtinPalettes.version).toBe(PALETTE_REGISTRY_VERSION)
    expect(Object.keys(builtinPalettes.entries).length).toBeGreaterThan(0)
  })

  it('names every color and keeps its three forms consistent', () => {
    const palette = Object.values(builtinPalettes.entries)[0]!
    expect(palette.colors.length).toBeGreaterThan(0)
    for (const named of palette.colors) {
      expect(named.name.length).toBeGreaterThan(0)
      expect(named.color.srgbHex).toMatch(/^#[0-9a-f]{6}$/)
      expect(named.color.oklab).toEqual(srgbToOkLab(parseHex(named.color.srgbHex)))
    }
  })
})
