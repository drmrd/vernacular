import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { AssetCache } from '../../storage'
import { InMemoryAssetCache } from '../../storage'
import { AssetCacheProvider, useAssetCache } from './asset-cache-context'

afterEach(cleanup)

const fakeCache: AssetCache = {
  has: async () => false,
  get: async () => undefined,
  put: async () => {},
}

function CacheProbe({ onCache }: { onCache: (cache: AssetCache) => void }) {
  onCache(useAssetCache())
  return null
}

describe('AssetCacheProvider', () => {
  it('exposes the provided asset cache to consumers', () => {
    let captured: AssetCache | undefined
    render(
      <AssetCacheProvider assets={fakeCache}>
        <CacheProbe
          onCache={(cache) => {
            captured = cache
          }}
        />
      </AssetCacheProvider>,
    )

    expect(captured).toBe(fakeCache)
  })

  it('falls back to a working in-memory cache outside a provider', () => {
    let captured: AssetCache | undefined
    const renderOrphan = () =>
      render(
        <CacheProbe
          onCache={(cache) => {
            captured = cache
          }}
        />,
      )

    expect(renderOrphan).not.toThrow()
    expect(captured).toBeInstanceOf(InMemoryAssetCache)
  })
})
