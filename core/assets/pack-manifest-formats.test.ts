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

describe('validatePackManifest - format version', () => {
  it.each([3, 0, 1.5, '2'])(
    'refuses a manifest whose format version is %j and names the newest format this reader knows',
    (formatVersion) => {
      const result = validatePackManifest({ ...validManifest(), formatVersion })

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      const message = result.errors[0] ?? ''
      const rejectedValue = JSON.stringify(formatVersion)
      expect(message).toMatch(/^formatVersion\b/)
      expect(message).toContain(rejectedValue)
      expect(message.replace(rejectedValue, '')).toContain('2')
    },
  )
})

describe('validatePackManifest - asset media types', () => {
  function withoutMediaType(asset: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...asset }
    delete copy.mediaType
    return copy
  }

  it.each([
    {
      case: 'a format 2 model with no media type',
      formatVersion: 2,
      asset: withoutMediaType(validModelAsset()),
      expectedHint: /model\/gltf-binary/,
    },
    {
      case: 'a format 2 texture with no media type',
      formatVersion: 2,
      asset: withoutMediaType(validTextureAsset()),
      expectedHint: /image\/png/,
    },
    {
      case: 'a texture with a model media type',
      formatVersion: 2,
      asset: { ...validTextureAsset(), mediaType: 'model/gltf-binary' },
      expectedHint: /image\/png/,
    },
    {
      case: 'a furniture asset with an image media type',
      formatVersion: 2,
      asset: { ...validModelAsset(), mediaType: 'image/png' },
      expectedHint: /model\/gltf-binary/,
    },
    {
      case: 'a format 1 asset with an image media type',
      formatVersion: 1,
      asset: { ...validModelAsset(), mediaType: 'image/png' },
      expectedHint: /model\/gltf-binary|formatVersion 2/,
    },
  ])('refuses $case with one error that names the allowed types', (scenario) => {
    const manifest = {
      ...validManifest(),
      formatVersion: scenario.formatVersion,
      assets: [scenario.asset],
    }

    const result = validatePackManifest(manifest)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    const message = result.errors[0] ?? ''
    expect(message).toMatch(/^assets\[0\]\.mediaType\b/)
    expect(message).toMatch(scenario.expectedHint)
  })
})
