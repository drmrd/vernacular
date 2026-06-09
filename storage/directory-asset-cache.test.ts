import { describe, expect, it } from 'vitest'
import { ASSET_DIRECTORY_PREFIX, DirectoryAssetCache } from './directory-asset-cache'
import { InMemoryDirectory } from './fs/in-memory-directory'

const HASH = 'abc123'
const BYTES = Uint8Array.of(1, 2, 3, 4)

describe('DirectoryAssetCache', () => {
  it('writes put bytes into the directory under the asset prefix', async () => {
    const directory = new InMemoryDirectory()
    const cache = new DirectoryAssetCache(directory)
    await cache.put(HASH, BYTES)
    expect(await directory.readFile(`${ASSET_DIRECTORY_PREFIX}/${HASH}`)).toEqual(BYTES)
  })

  it('gets back the bytes that were put byte-for-byte', async () => {
    const cache = new DirectoryAssetCache(new InMemoryDirectory())
    await cache.put(HASH, BYTES)
    expect(await cache.get(HASH)).toEqual(BYTES)
  })

  it('reports presence only after a put', async () => {
    const cache = new DirectoryAssetCache(new InMemoryDirectory())
    expect(await cache.has(HASH)).toBe(false)
    await cache.put(HASH, BYTES)
    expect(await cache.has(HASH)).toBe(true)
  })

  it('returns undefined when getting a hash that was never put', async () => {
    const cache = new DirectoryAssetCache(new InMemoryDirectory())
    expect(await cache.get(HASH)).toBeUndefined()
  })
})
