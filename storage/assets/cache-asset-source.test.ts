import { describe, expect, it } from 'vitest'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { CacheAssetSource } from './cache-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(4, 5, 6)

describe('CacheAssetSource', () => {
  it('uses the id it was constructed with', () => {
    const source = new CacheAssetSource('project', new InMemoryAssetCache())
    expect(source.id).toBe('project')
  })

  it('reads bytes the underlying cache holds', async () => {
    const cache = new InMemoryAssetCache()
    await cache.put(HASH, BYTES)
    const source = new CacheAssetSource('project', cache)
    expect(await source.read(HASH)).toEqual(BYTES)
  })

  it('returns undefined when the underlying cache lacks the hash', async () => {
    const source = new CacheAssetSource('project', new InMemoryAssetCache())
    expect(await source.read(HASH)).toBeUndefined()
  })
})
