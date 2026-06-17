import { describe, expect, it } from 'vitest'
import { UserSource } from './user-source'
import type { UserLibraryIndex } from './user-source'
import type { LibraryItem } from './asset-source'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { DEFAULT_FURNITURE_HEIGHT_MM } from '../../core'

function makeIndex(): UserLibraryIndex {
  const items: LibraryItem[] = []
  return {
    list: async () => items.slice(),
    add: async (item) => {
      items.push(item)
    },
  }
}

const SAMPLE_META = {
  name: 'My Chair',
  footprint: { width: 600, depth: 600 },
  kind: 'furniture' as const,
  eras: [],
  categories: ['seating'],
}

const SAMPLE_BYTES = Uint8Array.of(10, 20, 30)

describe('UserSource', () => {
  it('exposes the id "user"', () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    expect(source.id).toBe('user')
  })

  it('put returns a LibraryItem with user scope, meta fields, and a sha256 content hash', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const item = await source.put(SAMPLE_BYTES, SAMPLE_META)

    expect(item.reference.scope).toBe('user')
    expect(item.name).toBe(SAMPLE_META.name)
    expect(item.kind).toBe(SAMPLE_META.kind)
    expect(item.categories).toEqual(SAMPLE_META.categories)
    expect(item.eras).toEqual(SAMPLE_META.eras)
    expect(item.footprint).toEqual(SAMPLE_META.footprint)
    expect(item.reference.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('read returns the cached bytes after put', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const item = await source.put(SAMPLE_BYTES, SAMPLE_META)
    const retrieved = await source.read(item.reference.contentHash)

    expect(retrieved).toEqual(SAMPLE_BYTES)
  })

  it('list returns the item after put', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const item = await source.put(SAMPLE_BYTES, SAMPLE_META)
    const listed = await source.list()

    expect(listed).toEqual([item])
  })

  it('the content hash is stable: the same bytes always produce the same hash', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const first = await source.put(SAMPLE_BYTES, SAMPLE_META)
    const second = await source.put(SAMPLE_BYTES, SAMPLE_META)

    expect(second.reference.contentHash).toBe(first.reference.contentHash)
  })

  it('read returns undefined for an unknown content hash', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const result = await source.read('not-a-real-hash')

    expect(result).toBeUndefined()
  })

  it('put carries the meta height onto the returned item', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const item = await source.put(SAMPLE_BYTES, { ...SAMPLE_META, height: 815 })

    expect(item.height).toBe(815)
  })

  it('put defaults a missing meta height to the furniture default', async () => {
    const source = new UserSource(new InMemoryAssetCache(), makeIndex())
    const item = await source.put(SAMPLE_BYTES, SAMPLE_META)

    expect(item.height).toBe(DEFAULT_FURNITURE_HEIGHT_MM)
  })

  it('list defaults a legacy stored entry with no height to the furniture default', async () => {
    const legacy = {
      reference: { scope: 'user', contentHash: 'h' },
      name: 'Legacy',
      kind: 'furniture',
      categories: [],
      eras: [],
      footprint: { width: 600, depth: 600 },
    } as unknown as LibraryItem
    const index: UserLibraryIndex = {
      list: async () => [legacy],
      add: async () => {},
    }
    const source = new UserSource(new InMemoryAssetCache(), index)

    const listed = await source.list()

    expect(listed[0]?.height).toBe(DEFAULT_FURNITURE_HEIGHT_MM)
  })
})
