import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react'
import { InMemoryAssetCache, type AssetCache } from '../../storage'

// A module-level no-op cache so useAssetCache() outside a provider returns a
// working in-memory cache rather than throwing (a bare PlanView render: a story
// or isolated test). The real cache is provided once at app boot. See ADR-0042.
const FALLBACK_CACHE = new InMemoryAssetCache()

const AssetCacheContext = createContext<AssetCache>(FALLBACK_CACHE)

export interface AssetCacheProviderProps {
  assets: AssetCache
  children: ReactNode
}

export function AssetCacheProvider({ assets, children }: AssetCacheProviderProps): ReactElement {
  return createElement(AssetCacheContext.Provider, { value: assets }, children)
}

export function useAssetCache(): AssetCache {
  return useContext(AssetCacheContext)
}
