import { describe, expect, it } from 'vitest'
import { namedFiles, readPackManifest } from './pack-manifest-shape.ts'
import { validManifest } from './pack-manifest-test-support.ts'

const MODEL_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const THUMBNAIL_HASH = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
const MODEL_BYTES = 19512
const THUMBNAIL_BYTES = 4096
const FORMAT_WITH_DISTRIBUTION_FIELDS = 2

type Fields = Record<string, unknown>

function exampleAsset(): Fields {
  return {
    contentHash: MODEL_HASH,
    byteLength: MODEL_BYTES,
    thumbnail: { contentHash: THUMBNAIL_HASH, byteLength: THUMBNAIL_BYTES },
    name: 'Example armchair',
    kind: 'furniture',
    mediaType: 'model/gltf-binary',
    license: 'CC-BY-4.0',
    attribution: 'The Vernacular Contributors',
    eras: ['mid-century'],
    categories: ['seating'],
    dimensions: { width: 760, depth: 820, height: 900 },
  }
}

function exampleManifest(): Fields {
  return {
    ...validManifest(),
    formatVersion: FORMAT_WITH_DISTRIBUTION_FIELDS,
    assets: [exampleAsset()],
  }
}

function firstAssetOf(manifest: Fields) {
  const read = readPackManifest(manifest)
  if (read === undefined) throw new Error('the manifest should have been readable')
  return read.assets[0]
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
    const bare = exampleAsset()
    delete bare.thumbnail
    const asset = firstAssetOf({ ...exampleManifest(), assets: [bare] })
    expect(namedFiles(asset)).toEqual([{ contentHash: MODEL_HASH, byteLength: MODEL_BYTES }])
  })
})
