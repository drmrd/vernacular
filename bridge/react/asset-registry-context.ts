import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react'
import { AssetRegistry } from '../../storage'

// A module-level empty registry so useAssetRegistry() outside a provider returns a
// working (empty) registry rather than throwing. The real registry is provided once
// at app boot.
const FALLBACK_REGISTRY = new AssetRegistry([])

const AssetRegistryContext = createContext<AssetRegistry>(FALLBACK_REGISTRY)

export interface AssetRegistryProviderProps {
  registry: AssetRegistry
  children: ReactNode
}

export function AssetRegistryProvider({
  registry,
  children,
}: AssetRegistryProviderProps): ReactElement {
  return createElement(AssetRegistryContext.Provider, { value: registry }, children)
}

export function useAssetRegistry(): AssetRegistry {
  return useContext(AssetRegistryContext)
}
