import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../../core'
import { missingAsset } from '../../core'
import { AssetRegistry } from './asset-registry'
import { InMemoryAssetSource } from './in-memory-asset-source'
import type { AssetSource, LibraryItem } from './asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(1, 1, 1)
const OTHER_BYTES = Uint8Array.of(2, 2, 2)

describe('AssetRegistry resolution', () => {
  it('returns the bytes from the exactly-requested scope when present', async () => {
    const registry = new AssetRegistry([
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(BYTES)
      expect(resolution.resolvedScope).toBe('project')
    }
  })

  it('falls back to a hash match in a higher-precedence scope', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(OTHER_BYTES)
      expect(resolution.resolvedScope).toBe('user')
    }
  })

  it('prefers the requested scope over a higher-precedence scope that also has the hash', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe('project')
    }
  })
})

describe('AssetRegistry pack-version fallback', () => {
  const PACK_HASH = 'feed01'
  const PACK_BYTES = Uint8Array.of(7, 7, 7)

  it('resolves a pack hash from a different version of the same pack', async () => {
    const registry = new AssetRegistry([
      {
        kind: 'pack',
        source: new InMemoryAssetSource('pack:victorian@1.1.0', { [PACK_HASH]: PACK_BYTES }),
      },
    ])
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: PACK_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(PACK_BYTES)
      expect(resolution.resolvedScope).toBe('pack:victorian@1.1.0')
    }
  })

  it('does not cross to a different pack id on a pack-version fallback', async () => {
    const registry = new AssetRegistry([
      {
        kind: 'pack',
        source: new InMemoryAssetSource('pack:craftsman@1.0.0', { [PACK_HASH]: PACK_BYTES }),
      },
    ])
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: PACK_HASH }

    const resolution = await registry.resolve(reference)
    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe('pack:craftsman@1.0.0')
    }
  })
})

describe('AssetRegistry missing-asset placeholder', () => {
  const ABSENT_HASH = 'missing99'

  it('returns a labeled placeholder when no source holds the hash', async () => {
    const registry = new AssetRegistry([{ kind: 'user', source: new InMemoryAssetSource('user') }])
    const reference: AssetReference = { scope: 'user', contentHash: ABSENT_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution).toEqual(missingAsset(reference))
    expect(resolution.outcome).toBe('missing')
  })

  it('carries the footprint from the footprint lookup when one is known', async () => {
    const footprint = { width: 600, depth: 400, height: 900 }
    const registry = new AssetRegistry(
      [{ kind: 'user', source: new InMemoryAssetSource('user') }],
      {
        footprintFor: () => footprint,
      },
    )
    const reference: AssetReference = { scope: 'user', contentHash: ABSENT_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution).toEqual(missingAsset(reference, footprint))
    if (resolution.outcome === 'missing') {
      expect(resolution.footprint).toEqual(footprint)
    }
  })
})

describe('AssetRegistry listing', () => {
  const userItem: LibraryItem = {
    reference: { scope: 'user', contentHash: 'u1' },
    name: 'My Chair',
    kind: 'furniture',
    categories: ['seating'],
    eras: [],
    footprint: { width: 600, depth: 600 },
  }

  const packItem: LibraryItem = {
    reference: { scope: 'pack:vernacular-starter@1.0.0', contentHash: 'p1' },
    name: 'Starter Chair',
    kind: 'furniture',
    categories: ['seating'],
    eras: ['mid-century'],
    footprint: { width: 500, depth: 520 },
  }

  it('returns user items before pack items regardless of source registration order', async () => {
    const packSource: AssetSource = {
      id: 'pack:vernacular-starter@1.0.0',
      read: async () => undefined,
      list: async () => [packItem],
    }
    const userSource: AssetSource = {
      id: 'user',
      read: async () => undefined,
      list: async () => [userItem],
    }
    const registry = new AssetRegistry([
      { kind: 'pack', source: packSource },
      { kind: 'user', source: userSource },
    ])

    const items = await registry.list()

    expect(items).toEqual([userItem, packItem])
  })

  it('silently skips a source with no list method and returns the remaining items', async () => {
    const packSource: AssetSource = {
      id: 'pack:vernacular-starter@1.0.0',
      read: async () => undefined,
      list: async () => [packItem],
    }
    const userSource: AssetSource = {
      id: 'user',
      read: async () => undefined,
      list: async () => [userItem],
    }
    const projectSource: AssetSource = {
      id: 'project',
      read: async () => undefined,
    }
    const registry = new AssetRegistry([
      { kind: 'pack', source: packSource },
      { kind: 'user', source: userSource },
      { kind: 'project', source: projectSource },
    ])

    const items = await registry.list()

    expect(items).toHaveLength(2)
    expect(items).toEqual([userItem, packItem])
  })
})
