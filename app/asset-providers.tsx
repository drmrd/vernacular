import { type ReactNode } from 'react'
import { AssetCacheProvider, AssetRegistryProvider, UserAssetSourceProvider } from '../bridge'
import type { AssetCache } from '../storage'
import type { AssetLibrary } from './create-asset-library-registry'

export interface AssetProvidersProps {
  assets: AssetCache
  library: AssetLibrary
  children: ReactNode
}

// Groups the three asset providers (content cache, library registry, user import
// source) so the workspace tree stays flat and within the function-length budget.
export function AssetProviders({ assets, library, children }: AssetProvidersProps) {
  return (
    <AssetCacheProvider assets={assets}>
      <AssetRegistryProvider registry={library.registry}>
        <UserAssetSourceProvider source={library.userSource}>{children}</UserAssetSourceProvider>
      </AssetRegistryProvider>
    </AssetCacheProvider>
  )
}
