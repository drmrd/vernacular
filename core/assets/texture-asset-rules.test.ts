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
  it('accepts the valid texture with no errors', () => {
    expect(validatePackManifest(manifestWith(validTextureAsset()))).toEqual({
      valid: true,
      errors: [],
    })
  })

  it.each([
    { fault: 'no image', texture: textureWithout('image'), label: 'assets[0].image' },
    {
      fault: 'an image width of 100',
      texture: { ...validTextureAsset(), image: { width: 100, height: 256 } },
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width of 32',
      texture: { ...validTextureAsset(), image: { width: 32, height: 256 } },
      label: 'assets[0].image.width',
    },
    {
      fault: 'an image width of 4096',
      texture: { ...validTextureAsset(), image: { width: 4096, height: 256 } },
      label: 'assets[0].image.width',
    },
    { fault: 'no tile size', texture: textureWithout('tileSize'), label: 'assets[0].tileSize' },
    {
      fault: 'a tile width of 0',
      texture: { ...validTextureAsset(), tileSize: { width: 0, height: 1000 } },
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile width of -1',
      texture: { ...validTextureAsset(), tileSize: { width: -1, height: 1000 } },
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'a tile width of 100001',
      texture: { ...validTextureAsset(), tileSize: { width: 100001, height: 1000 } },
      label: 'assets[0].tileSize.width',
    },
    {
      fault: 'no color space',
      texture: textureWithout('colorSpace'),
      label: 'assets[0].colorSpace',
    },
    {
      fault: 'a color space of display-p3',
      texture: { ...validTextureAsset(), colorSpace: 'display-p3' },
      label: 'assets[0].colorSpace',
    },
    {
      fault: 'a dimensions object',
      texture: { ...validTextureAsset(), dimensions: { width: 500, depth: 500, height: 10 } },
      label: 'assets[0].dimensions',
    },
  ])('gives one error that names the field for $fault', ({ texture, label }) => {
    const result = validatePackManifest(manifestWith(texture))

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(label)
  })
})
