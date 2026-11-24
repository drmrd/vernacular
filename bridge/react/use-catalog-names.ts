import { useEffect, useState } from 'react'

import { useAssetRegistry } from './asset-registry-context'

// A single, stable empty map instance so the first synchronous render (and every
// still-loading or failed-load render) returns the same reference, avoiding a
// needless re-render of memoized label consumers.
const EMPTY_CATALOG_NAMES: ReadonlyMap<string, string> = new Map()

// Resolves the asset registry's catalog into a contentHash -> display name map for
// furnitureLabels. Labels must render synchronously on first paint while the registry's
// catalog() (an async read, possibly over IndexedDB or a network pack) is still in flight, so
// this starts at the shared empty map and swaps in the settled catalog once it resolves,
// guarding against a stale resolve landing after unmount or after the registry itself changes.
export function useCatalogNames(): ReadonlyMap<string, string> {
  const registry = useAssetRegistry()
  const [catalogNames, setCatalogNames] = useState<ReadonlyMap<string, string>>(EMPTY_CATALOG_NAMES)
  useEffect(() => {
    let cancelled = false
    // Resets to the shared empty map on every registry change; on first mount this is a
    // harmless Object.is no-op since state already holds that exact reference.
    setCatalogNames(EMPTY_CATALOG_NAMES)
    registry
      .catalog()
      .then((items) => {
        if (cancelled) return
        setCatalogNames(new Map(items.map((item) => [item.reference.contentHash, item.name])))
      })
      .catch((error) => {
        // Degrade to fallback labels rather than surfacing a load failure here.
        console.warn('Failed to list catalog names for furniture labels', error)
      })
    return () => {
      cancelled = true
    }
  }, [registry])
  return catalogNames
}
