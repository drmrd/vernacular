import { describe, expect, it } from 'vitest'
import {
  GROUND_BOUNCE_COLOR,
  GROUND_GRASS_REFERENCE,
  GROUND_SURFACE_COLOR,
  GROUND_SURFACE_HEX,
} from './ground-surface'
import { linearLuminance } from '../color/contrast'
import { srgbToLinear } from '../color/oklab'
import starterPackManifest from '../../public/packs/vernacular-starter-1.1.0/manifest.json'

// The lawn color is one fact stated twice: as the hex the engine paints the ground plane with,
// and as the linear-light color the sky dome multiplies its light by.

const MAX_CHANNEL_CODE = 255
const COLOR_TOLERANCE = 1e-6
const LUMINANCE_TOLERANCE = 1e-12
const GRASS_TILE_SIDE_MM = 2000

function linearChannelOfHex(hex: string, offset: number): number {
  const code = Number.parseInt(hex.slice(offset, offset + 2), 16)
  return srgbToLinear(code / MAX_CHANNEL_CODE)
}

describe('the ground surface', () => {
  it('is the lawn green #5f8a4f', () => {
    expect(GROUND_SURFACE_HEX).toBe('#5f8a4f')
  })

  it('carries the same color in linear light', () => {
    const expected = {
      r: linearChannelOfHex(GROUND_SURFACE_HEX, 1),
      g: linearChannelOfHex(GROUND_SURFACE_HEX, 3),
      b: linearChannelOfHex(GROUND_SURFACE_HEX, 5),
    }

    expect(Math.abs(GROUND_SURFACE_COLOR.r - expected.r)).toBeLessThan(COLOR_TOLERANCE)
    expect(Math.abs(GROUND_SURFACE_COLOR.g - expected.g)).toBeLessThan(COLOR_TOLERANCE)
    expect(Math.abs(GROUND_SURFACE_COLOR.b - expected.b)).toBeLessThan(COLOR_TOLERANCE)
  })

  it('bounces light as a neutral grey, each channel the luminance of the lawn', () => {
    const lawnLuminance = linearLuminance(GROUND_SURFACE_COLOR)
    expect(Math.abs(GROUND_BOUNCE_COLOR.r - lawnLuminance)).toBeLessThan(LUMINANCE_TOLERANCE)
    expect(Math.abs(GROUND_BOUNCE_COLOR.g - lawnLuminance)).toBeLessThan(LUMINANCE_TOLERANCE)
    expect(Math.abs(GROUND_BOUNCE_COLOR.b - lawnLuminance)).toBeLessThan(LUMINANCE_TOLERANCE)
  })

  it('bounces as much light as the lawn does, in luminance', () => {
    const difference = linearLuminance(GROUND_BOUNCE_COLOR) - linearLuminance(GROUND_SURFACE_COLOR)
    expect(Math.abs(difference)).toBeLessThan(LUMINANCE_TOLERANCE)
  })

  it('names the grass texture of the committed starter pack, tiled over two meters', () => {
    const namedAssets = starterPackManifest.assets.filter(
      (asset) => asset.contentHash === GROUND_GRASS_REFERENCE.contentHash,
    )

    expect(GROUND_GRASS_REFERENCE.scope).toBe('pack:vernacular-starter@1.1.0')
    expect(namedAssets).toHaveLength(1)
    expect(namedAssets[0]).toMatchObject({
      kind: 'texture',
      tileSize: { width: GRASS_TILE_SIDE_MM, height: GRASS_TILE_SIDE_MM },
    })
  })
})
