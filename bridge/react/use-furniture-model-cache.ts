import { useEffect, useMemo, useRef, useState } from 'react'

import type { SceneGraph } from '../../core'
import { disposeObject, parseFurnitureModel } from '../../engine'

import { useAssetRegistry } from './asset-registry-context'
import type { FurnitureModelLookup } from './framed-scene-reconciler'
import { createFurnitureModelCache, type FurnitureModelCache } from './furniture-model-cache'

// The parsed-model type the furniture cache holds, derived from the engine loader so the
// bridge names no Three.js type (engine is the only Three.js importer, ADR-0001).
type LoadedModel = Awaited<ReturnType<typeof parseFurnitureModel>>

/**
 * Loads each furniture instance's real model behind a content-hash cache and hands the
 * reconciler a lookup so a settled load swaps that piece's massing box for its mesh. The
 * cache resolves bytes through the asset registry, parses them in the engine, requests the
 * active floor's models, marks them live for bounded eviction, and bumps a version on each
 * settle so the memoized reconcile reruns and swaps only the now-ready piece.
 */
export function useFurnitureModelCache(graph: SceneGraph): {
  lookup: FurnitureModelLookup
  version: number
} {
  const registry = useAssetRegistry()
  const cacheRef = useRef<FurnitureModelCache<LoadedModel> | null>(null)
  if (cacheRef.current === null) {
    cacheRef.current = createFurnitureModelCache<LoadedModel>({
      resolve: async (ref) => {
        const result = await registry.resolve(ref)
        return result.outcome === 'resolved' ? result.bytes : undefined
      },
      parse: parseFurnitureModel,
      dispose: disposeObject,
    })
  }
  const cache = cacheRef.current
  const [version, setVersion] = useState(0)
  useEffect(() => cache.onChange(() => setVersion((value) => value + 1)), [cache])
  useEffect(() => () => cache.dispose(), [cache])
  useEffect(() => {
    cache.markLiveHashes(graph.furniture.map((item) => item.assetRef.contentHash))
    for (const item of graph.furniture) cache.request(item.assetRef)
  }, [cache, graph])
  return useMemo(() => ({ lookup: { get: (hash) => cache.get(hash) }, version }), [cache, version])
}
