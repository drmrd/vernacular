import { describe, expect, it } from 'vitest'
import type { AssetReference, TextureDescription } from '../../core'
import { AssetRegistry } from './asset-registry'
import type { AssetSource, LibraryItem } from './asset-source'

const OLD_PACK_ID = 'pack:vernacular-starter@1.0.0'
const NEW_PACK_ID = 'pack:vernacular-starter@1.1.0'
const OLD_PACK_HASH = 'old-pack-hash'
const OLD_PACK_BYTES = Uint8Array.of(7, 7, 7)

function itemIn(scope: AssetReference['scope'], contentHash: string, name: string): LibraryItem {
  return {
    reference: { scope, contentHash },
    name,
    kind: 'furniture',
    categories: ['seating'],
    eras: [],
    footprint: { width: 500, depth: 500 },
    height: 750,
  }
}

const userItem = itemIn('user', 'u1', 'My Chair')
const oldPackItem = itemIn(OLD_PACK_ID, OLD_PACK_HASH, 'Old Starter Chair')
const newPackItem = itemIn(NEW_PACK_ID, 'n1', 'New Starter Chair')

function sourceOf(id: string, items: readonly LibraryItem[]): AssetSource {
  return { id, read: async () => undefined, list: async () => [...items] }
}

function registryWithAnUnlistedOldPack(): AssetRegistry {
  return new AssetRegistry([
    { kind: 'pack', source: sourceOf(OLD_PACK_ID, [oldPackItem]), listed: false },
    { kind: 'pack', source: sourceOf(NEW_PACK_ID, [newPackItem]) },
    { kind: 'user', source: sourceOf('user', [userItem]) },
  ])
}

describe('AssetRegistry unlisted sources', () => {
  it('omits the items of an unlisted source from list', async () => {
    const items = await registryWithAnUnlistedOldPack().list()

    expect(items).toEqual([userItem, newPackItem])
  })

  it('lists a source that is explicitly marked as listed', async () => {
    const registry = new AssetRegistry([
      { kind: 'pack', source: sourceOf(NEW_PACK_ID, [newPackItem]), listed: true },
    ])

    expect(await registry.list()).toEqual([newPackItem])
  })

  it('includes unlisted sources in catalog, in scope precedence order', async () => {
    const items = await registryWithAnUnlistedOldPack().catalog()

    expect(items).toEqual([userItem, oldPackItem, newPackItem])
  })

  it('contributes nothing to catalog from a source with no list method', async () => {
    const registry = new AssetRegistry([
      { kind: 'project', source: { id: 'project', read: async () => undefined } },
      { kind: 'user', source: sourceOf('user', [userItem]) },
    ])

    expect(await registry.catalog()).toEqual([userItem])
  })

  it('still resolves the hash held by an unlisted source', async () => {
    const unlistedPack: AssetSource = {
      id: OLD_PACK_ID,
      read: async (hash) => (hash === OLD_PACK_HASH ? OLD_PACK_BYTES : undefined),
    }
    const registry = new AssetRegistry([{ kind: 'pack', source: unlistedPack, listed: false }])
    const reference: AssetReference = { scope: OLD_PACK_ID, contentHash: OLD_PACK_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe(OLD_PACK_ID)
      expect(resolution.bytes).toEqual(OLD_PACK_BYTES)
    }
  })

  it('still describes the hash held by an unlisted source', async () => {
    const description: TextureDescription = {
      kind: 'texture',
      mediaType: 'image/png',
      image: { width: 512, height: 512 },
      tileSize: { width: 1000, height: 1000 },
      colorSpace: 'srgb',
    }
    const unlistedPack: AssetSource = {
      id: OLD_PACK_ID,
      read: async () => undefined,
      describe: async (hash) => (hash === OLD_PACK_HASH ? description : undefined),
    }
    const registry = new AssetRegistry([{ kind: 'pack', source: unlistedPack, listed: false }])

    const described = await registry.describe({ scope: OLD_PACK_ID, contentHash: OLD_PACK_HASH })

    expect(described).toEqual(description)
  })
})
