import { describe, expect, it } from 'vitest'
import { PackSource } from './pack-source'
import type { MediaType } from '../../core'
import type { LibraryItem } from './asset-source'
import { GRASS_HASH, grassTextureAsset } from './texture-pack-test-support'

const MODEL_HASH = '0'.repeat(64)
const TEXTURE_HASH = GRASS_HASH

const VALID_MANIFEST = {
  packId: 'vernacular-starter',
  version: '1.0.0',
  license: 'CC0-1.0',
  attribution: 'Vernacular project',
  eras: ['mid-century'],
  categories: ['seating'],
  assets: [
    {
      contentHash: MODEL_HASH,
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

interface AssetCall {
  hash: string
  mediaType: MediaType | undefined
}

/** Each manifest() call returns the next entry; the last entry repeats. A rejection entry is thrown. */
function fakeReader(manifests: unknown[], { asset, thumbnail }: FakeReaderOptions = {}) {
  const calls = { manifest: 0, assets: [] as AssetCall[] }
  return {
    calls,
    manifest: async () => {
      const next = manifests[Math.min(calls.manifest, manifests.length - 1)]
      calls.manifest += 1
      if (next instanceof Error) throw next
      return next
    },
    readAsset: async (h: string, mediaType?: MediaType) => {
      calls.assets.push({ hash: h, mediaType })
      return h === MODEL_HASH || h === TEXTURE_HASH ? asset : undefined
    },
    readThumbnail: async (h: string) => (h === MODEL_HASH ? thumbnail : undefined),
  }
}

const ASSET_BYTES = Uint8Array.of(4, 5, 6)

const PACK_ID = 'pack:vernacular-starter@1.0.0'

const EXPECTED_ITEM: LibraryItem = {
  reference: { scope: PACK_ID, contentHash: MODEL_HASH },
  name: 'Mid-century chair',
  kind: 'furniture',
  categories: ['seating'],
  eras: ['mid-century'],
  styles: [],
  footprint: { width: 500, depth: 520 },
  height: 800,
  thumbnail: { scope: PACK_ID, contentHash: MODEL_HASH },
}

const STYLED_MANIFEST = {
  ...VALID_MANIFEST,
  assets: [{ ...VALID_MANIFEST.assets[0], styles: ['queen-anne'] }],
}

const FORMAT_2_MANIFEST = {
  ...VALID_MANIFEST,
  formatVersion: 2,
  assets: [
    grassTextureAsset(1000),
    { ...VALID_MANIFEST.assets[0], mediaType: 'model/gltf-binary' },
  ],
}

describe('PackSource', () => {
  it('lists valid pack assets as library items', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    const items = await source.list()
    expect(items).toEqual([EXPECTED_ITEM])
  })

  it('defaults each listed item styles to an empty array when the manifest omits them', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    const items = await source.list()
    expect(items[0]?.styles).toEqual([])
  })

  it('carries the manifest asset styles onto the listed item', async () => {
    const source = new PackSource(fakeReader([STYLED_MANIFEST]))
    const items = await source.list()
    expect(items[0]?.styles).toEqual(['queen-anne'])
  })

  it('sets each listed item height from the manifest asset dimensions', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    const items = await source.list()
    expect(items[0]?.height).toBe(800)
  })

  it('a format 2 pack lists only its models', async () => {
    const source = new PackSource(fakeReader([FORMAT_2_MANIFEST]))
    const items = await source.list()
    expect(items).toEqual([EXPECTED_ITEM])
  })

  it('a format 1 pack lists an asset of kind texture as a model', async () => {
    const manifest = {
      ...VALID_MANIFEST,
      assets: [{ ...VALID_MANIFEST.assets[0], kind: 'texture' }],
    }
    const source = new PackSource(fakeReader([manifest]))
    const items = await source.list()
    expect(items).toEqual([{ ...EXPECTED_ITEM, kind: 'texture' }])
  })

  it('returns an empty list for an invalid manifest without throwing', async () => {
    const source = new PackSource(fakeReader([{}]))
    await expect(source.list()).resolves.toEqual([])
  })

  it('returns an empty list for a partially invalid manifest without throwing', async () => {
    const source = new PackSource(fakeReader([{ packId: 'x' }]))
    await expect(source.list()).resolves.toEqual([])
  })

  it('reads asset bytes from the reader by content hash', async () => {
    const assetBytes = Uint8Array.of(1, 2, 3)
    const source = new PackSource(fakeReader([VALID_MANIFEST], { asset: assetBytes }))
    await source.list()
    expect(await source.read(MODEL_HASH)).toEqual(assetBytes)
  })

  it('reads thumbnail bytes from the reader by content hash', async () => {
    const thumbnailBytes = Uint8Array.of(9, 9)
    const source = new PackSource(fakeReader([VALID_MANIFEST], { thumbnail: thumbnailBytes }))
    await source.list()
    expect(await source.readThumbnail?.(MODEL_HASH)).toEqual(thumbnailBytes)
  })

  it('returns undefined from readThumbnail() for an unknown content hash', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST], { thumbnail: Uint8Array.of(9, 9) }))
    await source.list()
    expect(await source.readThumbnail?.('nope')).toBeUndefined()
  })
})

describe('PackSource reading an asset from the file of its media type', () => {
  it('reads a format 2 texture as image/png', async () => {
    const reader = fakeReader([FORMAT_2_MANIFEST], { asset: ASSET_BYTES })
    const bytes = await new PackSource(reader).read(TEXTURE_HASH)
    expect(reader.calls.assets).toEqual([{ hash: TEXTURE_HASH, mediaType: 'image/png' }])
    expect(bytes).toEqual(ASSET_BYTES)
  })

  it('reads a format 2 model as model/gltf-binary', async () => {
    const reader = fakeReader([FORMAT_2_MANIFEST], { asset: ASSET_BYTES })
    await new PackSource(reader).read(MODEL_HASH)
    expect(reader.calls.assets).toEqual([{ hash: MODEL_HASH, mediaType: 'model/gltf-binary' }])
  })

  it('reads a format 1 asset, which has no media type, as model/gltf-binary', async () => {
    const reader = fakeReader([VALID_MANIFEST], { asset: ASSET_BYTES })
    await new PackSource(reader).read(MODEL_HASH)
    expect(reader.calls.assets).toEqual([{ hash: MODEL_HASH, mediaType: 'model/gltf-binary' }])
  })

  it('gives undefined without reading a file for a hash outside the manifest', async () => {
    const reader = fakeReader([VALID_MANIFEST], { asset: ASSET_BYTES })
    expect(await new PackSource(reader).read('nope')).toBeUndefined()
    expect(reader.calls.assets).toEqual([])
  })
})

describe('PackSource describing an asset', () => {
  it('describes a texture asset with its image, tile size, and color space', async () => {
    const source = new PackSource(fakeReader([FORMAT_2_MANIFEST]))
    expect(await source.describe(TEXTURE_HASH)).toEqual({
      kind: 'texture',
      mediaType: 'image/png',
      image: { width: 256, height: 256 },
      tileSize: { width: 1000, height: 1000 },
      colorSpace: 'srgb',
    })
  })

  it('describes a model asset with its dimensions', async () => {
    const source = new PackSource(fakeReader([FORMAT_2_MANIFEST]))
    expect(await source.describe(MODEL_HASH)).toEqual({
      kind: 'model',
      mediaType: 'model/gltf-binary',
      dimensions: { width: 500, depth: 520, height: 800 },
    })
  })

  it('describes a format 1 asset as a model', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    expect(await source.describe(MODEL_HASH)).toEqual({
      kind: 'model',
      mediaType: 'model/gltf-binary',
      dimensions: { width: 500, depth: 520, height: 800 },
    })
  })

  it('describes an unknown hash as undefined', async () => {
    const source = new PackSource(fakeReader([FORMAT_2_MANIFEST]))
    expect(await source.describe('nope')).toBeUndefined()
  })
})

describe('PackSource loading its manifest', () => {
  it('loads the manifest once for reads made before the first list', async () => {
    const reader = fakeReader([VALID_MANIFEST], { asset: ASSET_BYTES })
    const source = new PackSource(reader)
    await Promise.all([source.read(MODEL_HASH), source.read(MODEL_HASH)])
    expect(reader.calls.manifest).toBe(1)
    await source.list()
    expect(reader.calls.manifest).toBe(1)
  })

  it('names the pack after a list', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    await source.list()
    expect(source.id).toBe(PACK_ID)
  })

  it('names the pack after a read that comes before any list', async () => {
    const source = new PackSource(fakeReader([VALID_MANIFEST]))
    await source.read(MODEL_HASH)
    expect(source.id).toBe(PACK_ID)
  })

  it('keeps the placeholder id while the manifest is invalid', async () => {
    const source = new PackSource(fakeReader([{ packId: 'x' }]))
    await source.read(MODEL_HASH)
    expect(source.id).toBe('pack:unknown@0.0.0')
  })

  it('rejects a read when the manifest fails to load', async () => {
    const reader = fakeReader([new Error('offline')], { asset: ASSET_BYTES })
    await expect(new PackSource(reader).read(MODEL_HASH)).rejects.toThrow('offline')
  })

  it('loads the manifest again on the read after a failed load', async () => {
    const reader = fakeReader([new Error('offline'), VALID_MANIFEST], { asset: ASSET_BYTES })
    const source = new PackSource(reader)
    await source.read(MODEL_HASH).catch(() => undefined)
    expect(await source.read(MODEL_HASH)).toEqual(ASSET_BYTES)
  })

  it('gives undefined without reading a file when the manifest is invalid', async () => {
    const reader = fakeReader([{}], { asset: ASSET_BYTES })
    expect(await new PackSource(reader).read(MODEL_HASH)).toBeUndefined()
    expect(reader.calls.assets).toEqual([])
  })

  it('loads an invalid manifest again on the next read', async () => {
    const reader = fakeReader([{}, VALID_MANIFEST], { asset: ASSET_BYTES })
    const source = new PackSource(reader)
    await source.read(MODEL_HASH)
    expect(await source.read(MODEL_HASH)).toEqual(ASSET_BYTES)
  })
})
