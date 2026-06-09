import { describe, expect, it } from 'vitest'
import { InMemoryAssetCache } from './in-memory-asset-cache'

const HASH = 'sha256-abc'
const OTHER_BYTE = 0xff

function sampleBytes() {
  return new Uint8Array([1, 2, 3])
}

describe('InMemoryAssetCache', () => {
  it('reports an unknown hash as absent and undefined', async () => {
    const cache = new InMemoryAssetCache()
    expect(await cache.has(HASH)).toBe(false)
    expect(await cache.get(HASH)).toBeUndefined()
  })

  it('round-trips bytes stored under a hash', async () => {
    const cache = new InMemoryAssetCache()
    const bytes = sampleBytes()
    await cache.put(HASH, bytes)
    expect(await cache.has(HASH)).toBe(true)
    expect(await cache.get(HASH)).toEqual(bytes)
  })

  it('treats a re-put of identical bytes as idempotent', async () => {
    const cache = new InMemoryAssetCache()
    await cache.put(HASH, sampleBytes())
    await cache.put(HASH, sampleBytes())
    expect(await cache.has(HASH)).toBe(true)
    expect(await cache.get(HASH)).toEqual(sampleBytes())
  })

  it('isolates the stored copy from later mutation of the caller input', async () => {
    const cache = new InMemoryAssetCache()
    const bytes = sampleBytes()
    await cache.put(HASH, bytes)
    bytes[0] = OTHER_BYTE
    expect(await cache.get(HASH)).toEqual(sampleBytes())
  })
})
