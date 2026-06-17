import { describe, expect, it } from 'vitest'
import { PackSource } from './pack-source'
import type { LibraryItem } from './asset-source'

const ZERO_HASH = '0'.repeat(64)

const VALID_MANIFEST = {
  packId: 'vernacular-starter',
  version: '1.0.0',
  license: 'CC0-1.0',
  attribution: 'Vernacular project',
  eras: ['mid-century'],
  categories: ['seating'],
  assets: [
    {
      contentHash: ZERO_HASH,
      name: 'Mid-century chair',
      kind: 'furniture',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      categories: ['seating'],
      dimensions: { width: 500, depth: 520, height: 800 },
    },
  ],
}

interface FakeReaderOptions {
  asset?: Uint8Array
  thumbnail?: Uint8Array
}

function fakeReader(manifest: unknown, { asset, thumbnail }: FakeReaderOptions = {}) {
  return {
    manifest: async () => manifest,
    readAsset: async (h: string) => (h === ZERO_HASH ? asset : undefined),
    readThumbnail: async (h: string) => (h === ZERO_HASH ? thumbnail : undefined),
  }
}

const PACK_ID = 'pack:vernacular-starter@1.0.0'

const EXPECTED_ITEM: LibraryItem = {
  reference: { scope: PACK_ID, contentHash: ZERO_HASH },
  name: 'Mid-century chair',
  kind: 'furniture',
  categories: ['seating'],
  eras: ['mid-century'],
  footprint: { width: 500, depth: 520 },
  height: 800,
  thumbnail: { scope: PACK_ID, contentHash: ZERO_HASH },
}

describe('PackSource', () => {
  it('lists valid pack assets as library items', async () => {
    const source = new PackSource(fakeReader(VALID_MANIFEST))
    const items = await source.list()
    expect(items).toEqual([EXPECTED_ITEM])
  })

  it('sets each listed item height from the manifest asset dimensions', async () => {
    const source = new PackSource(fakeReader(VALID_MANIFEST))
    const items = await source.list()
    expect(items[0]?.height).toBe(800)
  })

  it('returns an empty list for an invalid manifest without throwing', async () => {
    const source = new PackSource(fakeReader({}))
    await expect(source.list()).resolves.toEqual([])
  })

  it('returns an empty list for a partially invalid manifest without throwing', async () => {
    const source = new PackSource(fakeReader({ packId: 'x' }))
    await expect(source.list()).resolves.toEqual([])
  })

  it('exposes the pack id as source.id after a successful list()', async () => {
    const source = new PackSource(fakeReader(VALID_MANIFEST))
    await source.list()
    expect(source.id).toBe(PACK_ID)
  })

  it('reads asset bytes from the reader by content hash', async () => {
    const assetBytes = Uint8Array.of(1, 2, 3)
    const source = new PackSource(fakeReader(VALID_MANIFEST, { asset: assetBytes }))
    await source.list()
    expect(await source.read(ZERO_HASH)).toEqual(assetBytes)
  })

  it('returns undefined from read() for an unknown content hash', async () => {
    const source = new PackSource(fakeReader(VALID_MANIFEST, { asset: Uint8Array.of(1, 2, 3) }))
    await source.list()
    expect(await source.read('nope')).toBeUndefined()
  })

  it('reads thumbnail bytes from the reader by content hash', async () => {
    const thumbnailBytes = Uint8Array.of(9, 9)
    const source = new PackSource(fakeReader(VALID_MANIFEST, { thumbnail: thumbnailBytes }))
    await source.list()
    expect(await source.readThumbnail?.(ZERO_HASH)).toEqual(thumbnailBytes)
  })

  it('returns undefined from readThumbnail() for an unknown content hash', async () => {
    const source = new PackSource(fakeReader(VALID_MANIFEST, { thumbnail: Uint8Array.of(9, 9) }))
    await source.list()
    expect(await source.readThumbnail?.('nope')).toBeUndefined()
  })
})
