import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './pack-manifest'

function validManifest(): Record<string, unknown> {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
    assets: [],
  }
}

function validModelAsset(): Record<string, unknown> {
  return {
    contentHash: '0'.repeat(64),
    name: 'Example chair',
    kind: 'furniture',
    mediaType: 'model/gltf-binary',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
    dimensions: { width: 500, depth: 520, height: 800 },
  }
}

function validTextureAsset(): Record<string, unknown> {
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

describe('validatePackManifest - format 2 texture assets', () => {
  it('accepts a format 2 manifest with a texture asset that has a PNG media type, an image size, a tile size, and a color space, and no dimensions', () => {
    const manifest = {
      ...validManifest(),
      formatVersion: 2,
      assets: [validModelAsset(), validTextureAsset()],
    }
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })
})
