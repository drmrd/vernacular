import { useMemo, type ReactNode } from 'react'
import { AssetCacheProvider, AssetRegistryProvider, UserAssetSourceProvider } from '../bridge'
import { assetsOf, type DocumentHandle } from '../session'
import type { AssetLibrary } from './create-asset-library-registry'

export interface AssetProvidersProps {
  /** The open project. Its asset cache is the content cache of the editor. */
  handle: DocumentHandle
  /** The user's library, built over the shared pool and not over one project's cache. */
  library: AssetLibrary
  children: ReactNode
}

// Groups the three asset providers (content cache, library registry, user import
// source) so the workspace tree stays flat and within the function-length budget.
// The content cache is the open project's own: a folder project reads its folder first.
export function AssetProviders({ handle, library, children }: AssetProvidersProps) {
  const assets = useMemo(() => assetsOf(handle), [handle])
  return (
    <AssetCacheProvider assets={assets}>
      <AssetRegistryProvider registry={library.registry}>
        <UserAssetSourceProvider source={library.userSource}>{children}</UserAssetSourceProvider>
      </AssetRegistryProvider>
    </AssetCacheProvider>
  )
}
