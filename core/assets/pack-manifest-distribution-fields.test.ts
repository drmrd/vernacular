import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './pack-manifest.ts'
import { specificationAsset, validManifest } from './pack-manifest-test-support.ts'

const SHORT_HASH_LENGTH = 63
const FORMAT_WITH_DISTRIBUTION_FIELDS = 2

type Fields = Record<string, unknown>

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

const THUMBNAIL_OBJECT_ERROR = /^assets\[0\]\.thumbnail must be an object/

function refusedCases(): [string, Fields, RegExp][] {
  const base = specificationAsset()
  const thumbnail = base.thumbnail as Fields
  return [
    ['byteLength of zero', { ...base, byteLength: 0 }, /^assets\[0\]\.byteLength/],
    ['byteLength of -1', { ...base, byteLength: -1 }, /^assets\[0\]\.byteLength/],
    ['fractional byteLength', { ...base, byteLength: 1.5 }, /^assets\[0\]\.byteLength/],
    ['string byteLength', { ...base, byteLength: '12' }, /^assets\[0\]\.byteLength/],
    ['null thumbnail', { ...base, thumbnail: null }, THUMBNAIL_OBJECT_ERROR],
    ['string thumbnail', { ...base, thumbnail: 'x' }, THUMBNAIL_OBJECT_ERROR],
    ['array thumbnail', { ...base, thumbnail: [] }, THUMBNAIL_OBJECT_ERROR],
    [
      'short thumbnail contentHash',
      { ...base, thumbnail: { ...thumbnail, contentHash: 'a'.repeat(SHORT_HASH_LENGTH) } },
      /^assets\[0\]\.thumbnail\.contentHash/,
    ],
    [
      'missing thumbnail byteLength',
      { ...base, thumbnail: without(thumbnail, 'byteLength') },
      /^assets\[0\]\.thumbnail\.byteLength/,
    ],
    [
      'fractional thumbnail byteLength',
      { ...base, thumbnail: { ...thumbnail, byteLength: 1.5 } },
      /^assets\[0\]\.thumbnail\.byteLength/,
    ],
    [
      'string thumbnail byteLength',
      { ...base, thumbnail: { ...thumbnail, byteLength: '12' } },
      /^assets\[0\]\.thumbnail\.byteLength/,
    ],
    ['empty copyright', { ...base, copyright: '' }, /^assets\[0\]\.copyright/],
    ['numeric copyright', { ...base, copyright: 7 }, /^assets\[0\]\.copyright/],
    ['blank copyright', { ...base, copyright: '  ' }, /^assets\[0\]\.copyright/],
    ['numeric changes', { ...base, changes: 7 }, /^assets\[0\]\.changes/],
  ]
}

describe('accepts the four optional distribution fields and refuses malformed ones', () => {
  it('accepts an asset that carries all four fields', () => {
    const manifest = manifestOfFormat(FORMAT_WITH_DISTRIBUTION_FIELDS, specificationAsset())
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })

  it('accepts an asset that carries none of the four fields', () => {
    let asset = specificationAsset()
    for (const key of ['byteLength', 'thumbnail', 'copyright', 'changes']) {
      asset = without(asset, key)
    }
    expect(errorsFor(asset)).toEqual([])
  })

  it.each(refusedCases())(
    'refuses a %s with one error naming its path',
    (_name, asset, pattern) => {
      const errors = errorsFor(asset)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(pattern)
    },
  )

  it('keeps a format 1 manifest with the distribution fields valid', () => {
    const formatOneAsset = without(specificationAsset(), 'mediaType')
    const manifest = manifestOfFormat(1, formatOneAsset)
    expect(validatePackManifest(manifest)).toEqual({ valid: true, errors: [] })
  })

  it('refuses a malformed field in a format 1 manifest with one error naming its path', () => {
    const asset = { ...without(specificationAsset(), 'mediaType'), copyright: '' }
    const errors = validatePackManifest(manifestOfFormat(1, asset)).errors
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^assets\[0\]\.copyright/)
  })
})
