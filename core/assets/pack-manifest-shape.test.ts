import { describe, expect, it } from 'vitest'
import { namedFiles, readPackManifest } from './pack-manifest-shape.ts'
import { specificationAsset, validManifest } from './pack-manifest-test-support.ts'

const MODEL_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const THUMBNAIL_HASH = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
const MODEL_BYTES = 19512
const THUMBNAIL_BYTES = 4096
const FORMAT_WITH_DISTRIBUTION_FIELDS = 2

type Fields = Record<string, unknown>

function exampleManifest(): Fields {
  return {
    ...validManifest(),
    formatVersion: FORMAT_WITH_DISTRIBUTION_FIELDS,
    assets: [specificationAsset()],
  }
}

function firstAssetOf(manifest: Fields) {
  const read = readPackManifest(manifest)
  if (read === undefined) throw new Error('the manifest should have been readable')
  const [first] = read.assets
  if (first === undefined) throw new Error('expected one asset')
  return first
}

describe('reads a valid manifest into typed assets and gives nothing for an invalid one', () => {
  it('reads the example asset with its file sizes', () => {
    const asset = firstAssetOf(exampleManifest())
    expect(asset.byteLength).toBe(MODEL_BYTES)
    expect(asset.thumbnail?.byteLength).toBe(THUMBNAIL_BYTES)
  })

  it('reads a manifest with no formatVersion as format 1', () => {
    const manifest = { ...validManifest(), assets: [] }
    expect(readPackManifest(manifest)?.formatVersion).toBe(1)
  })

  it('gives undefined for an invalid manifest', () => {
    expect(readPackManifest({ ...exampleManifest(), packId: undefined })).toBeUndefined()
  })

  it('names the model file and the thumbnail file of the example asset', () => {
    expect(namedFiles(firstAssetOf(exampleManifest()))).toEqual([
      { contentHash: MODEL_HASH, byteLength: MODEL_BYTES },
      { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES },
    ])
  })

  it('names one file for an asset with no thumbnail', () => {
    const bare = specificationAsset()
    delete bare.thumbnail
    const asset = firstAssetOf({ ...exampleManifest(), assets: [bare] })
    expect(namedFiles(asset)).toEqual([{ contentHash: MODEL_HASH, byteLength: MODEL_BYTES }])
  })

  it('lists a thumbnail as only its content hash and byte length', () => {
    const noted = specificationAsset()
    noted.thumbnail = { ...(noted.thumbnail as Fields), note: 'kept by the reader' }
    const asset = firstAssetOf({ ...exampleManifest(), assets: [noted] })
    const files = namedFiles(asset)
    expect(files).toStrictEqual([
      { contentHash: MODEL_HASH, byteLength: MODEL_BYTES },
      { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES },
    ])
    expect(files[1]).not.toBe(asset.thumbnail)
  })

  it('reads a format 2 manifest with formatVersion 2', () => {
    expect(readPackManifest(exampleManifest())?.formatVersion).toBe(FORMAT_WITH_DISTRIBUTION_FIELDS)
  })

  it('names only the content hash for an asset with no byteLength', () => {
    const unsized = specificationAsset()
    delete unsized.byteLength
    delete unsized.thumbnail
    const asset = firstAssetOf({ ...exampleManifest(), assets: [unsized] })
    expect(namedFiles(asset)).toStrictEqual([{ contentHash: MODEL_HASH }])
  })
})
