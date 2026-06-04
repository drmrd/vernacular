import { describe, expect, it } from 'vitest'
import { SHELL_CACHE_PREFIX, shellCacheName, staleShellCacheNames } from './shell-cache'

describe('shellCacheName', () => {
  it('derives a versioned cache name under the shell prefix', () => {
    const name = shellCacheName(3)
    expect(name.startsWith(SHELL_CACHE_PREFIX)).toBe(true)
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
