import { describe, expect, it } from 'vitest'
import {
  SHELL_CACHE_PREFIX,
  shellCacheName,
  staleShellCacheNames,
  purgeStaleShellCaches,
  type CacheStorageLike,
} from './shell-cache'

describe('shellCacheName', () => {
  it('derives a versioned cache name under the shell prefix', () => {
    const name = shellCacheName(3)
    expect(name).toBe(`${SHELL_CACHE_PREFIX}v3`)
  })
})

describe('staleShellCacheNames', () => {
  it('selects shell caches other than the current one and ignores foreign caches', () => {
    const current = shellCacheName(2)
    const existing = [shellCacheName(1), current, 'workbox-precache', 'some-other-cache']

    expect(staleShellCacheNames(existing, current)).toEqual([shellCacheName(1)])
  })
})

describe('purgeStaleShellCaches', () => {
  it('deletes every stale shell cache and returns their names', async () => {
    const deleted: string[] = []
    const current = shellCacheName(1)
    const host: CacheStorageLike = {
      keys: () => Promise.resolve([shellCacheName(0), current, 'unrelated-cache']),
      delete: (name) => {
        deleted.push(name)
        return Promise.resolve(true)
      },
    }

    const purged = await purgeStaleShellCaches(host)

    expect(purged).toEqual([shellCacheName(0)])
    expect(deleted).toEqual([shellCacheName(0)])
  })
})
