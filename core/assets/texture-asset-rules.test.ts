import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './pack-manifest'

type Fields = Record<string, unknown>

function validTextureAsset(): Fields {
  return {
    contentHash: '1'.repeat(64),
    name: 'Mown grass',
    kind: 'texture',
    mediaType: 'image/png',
    image: { width: 256, height: 256 },
    tileSize: { width: 1000, height: 1000 },
    colorSpace: 'srgb',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['ground'],
  }
}

function textureWithout(field: string): Fields {
  const texture = validTextureAsset()
  delete texture[field]
  return texture
}

function textureWith(overrides: Fields): Fields {
  return { ...validTextureAsset(), ...overrides }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Anchored so `assets[0].image` cannot match an error about `assets[0].image.width`.
function startsWithLabel(label: string): RegExp {
  return new RegExp(`^${escapeRegExp(label)}\\b(?!\\.)`)
}

function manifestWith(texture: Fields): Fields {
  return {
    packId: 'vernacular-textures',
    version: '1.0.0',
    formatVersion: 2,
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['ground'],
    assets: [texture],
  }
}

describe('texture field rules', () => {
  it.each([
    { name: 'the valid texture', texture: validTextureAsset() },
    { name: 'an image side of 64', texture: textureWith({ image: { width: 64, height: 64 } }) },
    {
      name: 'an image side of 2048',
      texture: textureWith({ image: { width: 2048, height: 2048 } }),
    },
    {
      name: 'a tile side of 100000',
      texture: textureWith({ tileSize: { width: 100000, height: 100000 } }),
    },
    { name: 'a linear color space', texture: textureWith({ colorSpace: 'linear' }) },
  ])('accepts $name with no errors', ({ texture }) => {
    expect(validatePackManifest(manifestWith(texture))).toEqual({ valid: true, errors: [] })
  })

  it.each([
    { fault: 'no image', texture: textureWithout('image'), label: 'assets[0].image' },
    { fault: 'a null image', texture: textureWith({ image: null }), label: 'assets[0].image' },
    {
      fault: 'an image width of 100',
      texture: textureWith({ image: { width: 100, height: 256 } }),
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width of 32',
      texture: textureWith({ image: { width: 32, height: 256 } }),
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width of 4096',
      texture: textureWith({ image: { width: 4096, height: 256 } }),
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width given as the string 256',
      texture: textureWith({ image: { width: '256', height: 256 } }),
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width of 64.5',
      texture: textureWith({ image: { width: 64.5, height: 256 } }),
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image height of 100',
      texture: textureWith({ image: { width: 256, height: 100 } }),
      label: 'assets[0].image.height',
    },
    {
      fault: 'an image height of 4096',
      texture: textureWith({ image: { width: 256, height: 4096 } }),
      label: 'assets[0].image.height',
    },
    { fault: 'no tile size', texture: textureWithout('tileSize'), label: 'assets[0].tileSize' },
    {
      fault: 'a null tile size',
      texture: textureWith({ tileSize: null }),
      label: 'assets[0].tileSize',
    },
    {
      fault: 'a tile width of 0',
      texture: textureWith({ tileSize: { width: 0, height: 1000 } }),
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile width of -1',
      texture: textureWith({ tileSize: { width: -1, height: 1000 } }),
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile width of 100001',
      texture: textureWith({ tileSize: { width: 100001, height: 1000 } }),
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile width given as the string 1000',
      texture: textureWith({ tileSize: { width: '1000', height: 1000 } }),
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile height of 0',
      texture: textureWith({ tileSize: { width: 1000, height: 0 } }),
      label: 'assets[0].tileSize.height',
    },
    {
      fault: 'a tile height of 100001',
      texture: textureWith({ tileSize: { width: 1000, height: 100001 } }),
      label: 'assets[0].tileSize.height',
    },
    {
      fault: 'no color space',
      texture: textureWithout('colorSpace'),
      label: 'assets[0].colorSpace',
    },
    {
      fault: 'a color space of display-p3',
      texture: textureWith({ colorSpace: 'display-p3' }),
      label: 'assets[0].colorSpace',
    },
    {
      fault: 'a dimensions object',
      texture: textureWith({ dimensions: { width: 500, depth: 500, height: 10 } }),
      label: 'assets[0].dimensions',
    },
  ])('gives one error that names the field for $fault', ({ texture, label }) => {
    const result = validatePackManifest(manifestWith(texture))

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(startsWithLabel(label))
  })
})
