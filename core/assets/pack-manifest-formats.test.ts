import { describe, expect, it } from 'vitest'
import { assetFileName, isModelAsset, isTextureAsset } from './asset-description'
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
  it.each(['image/png', 'image/webp'])(
    'accepts a format 2 manifest with a %s texture asset that has an image size, a tile size, and a color space, and no dimensions',
    (mediaType) => {
      const manifest = {
        ...validManifest(),
        formatVersion: 2,
        assets: [validModelAsset(), { ...validTextureAsset(), mediaType }],
      }
      expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
    },
  )
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

describe('validatePackManifest - format 1 manifests read as before', () => {
  function formatOneTextureWithoutDimensions(): Record<string, unknown> {
    const copy = { ...validTextureAsset() }
    delete copy.mediaType
    return copy
  }

  it.each([
    {
      case: 'a furniture asset that names a media type',
      asset: validModelAsset(),
      expectedLabel: /^assets\[0\]\.mediaType\b/,
      expectedHint: /formatVersion 2/,
    },
    {
      case: 'a texture asset with no dimensions',
      asset: formatOneTextureWithoutDimensions(),
      expectedLabel: /^assets\[0\]\.dimensions\b/,
      expectedHint: /required/,
    },
  ])('refuses a format 1 manifest with $case, with one error', (scenario) => {
    const manifest = { ...validManifest(), formatVersion: 1, assets: [scenario.asset] }

    const result = validatePackManifest(manifest)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    const message = result.errors[0] ?? ''
    expect(message).toMatch(scenario.expectedLabel)
    expect(message).toMatch(scenario.expectedHint)
  })
})

describe('isModelAsset', () => {
  it.each([
    {
      label: 'no format version, no media type',
      formatVersion: undefined,
      mediaType: undefined,
      expected: true,
    },
    { label: 'format 1, no media type', formatVersion: 1, mediaType: undefined, expected: true },
    {
      label: 'format 1, image media type',
      formatVersion: 1,
      mediaType: 'image/png',
      expected: true,
    },
    {
      label: 'format 1, model media type',
      formatVersion: 1,
      mediaType: 'model/gltf-binary',
      expected: true,
    },
    {
      label: 'format 2, model media type',
      formatVersion: 2,
      mediaType: 'model/gltf-binary',
      expected: true,
    },
    {
      label: 'format 2, png media type',
      formatVersion: 2,
      mediaType: 'image/png',
      expected: false,
    },
    {
      label: 'format 2, webp media type',
      formatVersion: 2,
      mediaType: 'image/webp',
      expected: false,
    },
    {
      label: 'format string "2", png media type',
      formatVersion: '2',
      mediaType: 'image/png',
      expected: true,
    },
    {
      label: 'format 3, png media type',
      formatVersion: 3,
      mediaType: 'image/png',
      expected: true,
    },
    { label: 'format 2, no media type', formatVersion: 2, mediaType: undefined, expected: false },
  ])('$label', ({ formatVersion, mediaType, expected }) => {
    const asset = mediaType === undefined ? {} : { mediaType }
    expect(isModelAsset(asset, formatVersion)).toBe(expected)
  })
})

describe('isTextureAsset', () => {
  it.each([
    { label: 'format 2, png media type', formatVersion: 2, mediaType: 'image/png', expected: true },
    {
      label: 'format 2, webp media type',
      formatVersion: 2,
      mediaType: 'image/webp',
      expected: true,
    },
    {
      label: 'format 1, png media type',
      formatVersion: 1,
      mediaType: 'image/png',
      expected: false,
    },
    {
      label: 'format 1, webp media type',
      formatVersion: 1,
      mediaType: 'image/webp',
      expected: false,
    },
    {
      label: 'format 1, no media type',
      formatVersion: 1,
      mediaType: undefined,
      expected: false,
    },
    {
      label: 'format 2, model media type',
      formatVersion: 2,
      mediaType: 'model/gltf-binary',
      expected: false,
    },
    {
      label: 'format 2, unknown media type',
      formatVersion: 2,
      mediaType: 'model/obj',
      expected: false,
    },
    {
      label: 'format string "2", png media type',
      formatVersion: '2',
      mediaType: 'image/png',
      expected: false,
    },
    {
      label: 'format 3, png media type',
      formatVersion: 3,
      mediaType: 'image/png',
      expected: false,
    },
    { label: 'format 2, no media type', formatVersion: 2, mediaType: undefined, expected: false },
  ])('$label', ({ formatVersion, mediaType, expected }) => {
    const asset = mediaType === undefined ? {} : { mediaType }
    expect(isTextureAsset(asset, formatVersion)).toBe(expected)
  })
})

describe('assetFileName', () => {
  const HASH = 'b'.repeat(64)

  it.each([
    { mediaType: 'model/gltf-binary' as const, expected: `${HASH}.glb` },
    { mediaType: 'image/png' as const, expected: `${HASH}.png` },
    { mediaType: 'image/webp' as const, expected: `${HASH}.webp` },
  ])('names a $mediaType asset $expected', ({ mediaType, expected }) => {
    expect(assetFileName(HASH, mediaType)).toBe(expected)
  })
})
