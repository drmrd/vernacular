import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './pack-manifest.ts'
import { validManifest } from './pack-manifest-test-support.ts'

const SHORT_HASH_LENGTH = 63
const FORMAT_WITH_DISTRIBUTION_FIELDS = 2

type Fields = Record<string, unknown>

function specificationAsset(): Fields {
  return {
    contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    byteLength: 19512,
    thumbnail: {
      contentHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      byteLength: 4096,
    },
    name: 'Example armchair',
    kind: 'furniture',
    mediaType: 'model/gltf-binary',
    license: 'CC-BY-4.0',
    attribution: 'The Vernacular Contributors',
    copyright: 'Copyright 2026 The Vernacular Contributors',
    changes: 'Rebuilt the legs',
    sourceUrl: 'https://example.org/vernacular/example-armchair',
    eras: ['mid-century'],
    categories: ['seating'],
    dimensions: { width: 760, depth: 820, height: 900 },
  }
}

function without(fields: Fields, key: string): Fields {
  const copy = { ...fields }
  delete copy[key]
  return copy
}

function manifestOfFormat(formatVersion: number, asset: Fields): Fields {
  return { ...validManifest(), formatVersion, assets: [asset] }
}

function errorsFor(asset: Fields): string[] {
  return validatePackManifest(manifestOfFormat(FORMAT_WITH_DISTRIBUTION_FIELDS, asset)).errors
}

describe('validatePackManifest - distribution fields', () => {
  it('accepts the four optional distribution fields and refuses malformed ones', () => {
    const base = specificationAsset()
    const thumbnail = base.thumbnail as Fields
    const thumbnailWithoutLength = without(thumbnail, 'byteLength')

    expect(validatePackManifest(manifestOfFormat(FORMAT_WITH_DISTRIBUTION_FIELDS, base))).toEqual({
      valid: true,
      errors: [],
    })

    const refused: [Fields, RegExp][] = [
      [{ ...base, byteLength: 0 }, /^assets\[0\]\.byteLength/],
      [{ ...base, byteLength: 1.5 }, /^assets\[0\]\.byteLength/],
      [{ ...base, byteLength: '12' }, /^assets\[0\]\.byteLength/],
      [
        { ...base, thumbnail: { ...thumbnail, contentHash: 'a'.repeat(SHORT_HASH_LENGTH) } },
        /^assets\[0\]\.thumbnail\.contentHash/,
      ],
      [{ ...base, thumbnail: thumbnailWithoutLength }, /^assets\[0\]\.thumbnail\.byteLength/],
      [{ ...base, copyright: '' }, /^assets\[0\]\.copyright/],
      [{ ...base, changes: 7 }, /^assets\[0\]\.changes/],
    ]
    for (const [asset, pattern] of refused) {
      const errors = errorsFor(asset)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(pattern)
    }
  })

  it('keeps a format 1 manifest with the distribution fields valid', () => {
    const formatOneAsset = without(specificationAsset(), 'mediaType')
    const manifest = manifestOfFormat(1, formatOneAsset)
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })
})
