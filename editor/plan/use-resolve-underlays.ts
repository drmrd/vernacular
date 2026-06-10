import { useEffect, useRef, useState } from 'react'
import type { SceneGraph } from '../../core'
import type { AssetCache } from '../../bridge'
import { underlaysNeedingDecode, type UnderlayRef } from './underlay-resolve'

// The resolve-on-open half of the underlay persistence round trip: re-decode each
// saved underlay's source bytes from the asset cache back into the in-memory
// bitmap cache so a placed underlay repaints after a reload. The write-on-load
// half lives in `use-load-underlay-image.ts`. See ADR-0042.

type BitmapCache = Map<string, ImageBitmap>

// Resolve one underlay's source bytes from the asset cache and decode them into
// the bitmap cache. Returns true when a bitmap was cached. A missing asset (the
// backend did not persist it) or a decode failure is skipped (returns false), so
// a project opened where the assets did not persist degrades to the not-yet-
// decoded behavior rather than erroring.
async function resolveUnderlayBitmap(
  assets: AssetCache,
  cache: BitmapCache,
  contentHash: string,
): Promise<boolean> {
  try {
    const bytes = await assets.get(contentHash)
    if (bytes === undefined) {
      return false
    }
    cache.set(contentHash, await createImageBitmap(new Blob([new Uint8Array(bytes)])))
    return true
  } catch (error) {
    console.error('Failed to resolve underlay image', error)
    return false
  }
}

interface DecodeDeps {
  assets: AssetCache
  cache: BitmapCache
  inFlight: Set<string>
  onDecoded: () => void
}

// Decode each pending hash in turn, clearing its in-flight mark and signalling a
// repaint after each success so a resolved underlay paints as soon as it is ready.
async function decodePendingUnderlays(pending: readonly string[], deps: DecodeDeps): Promise<void> {
  for (const contentHash of pending) {
    const decoded = await resolveUnderlayBitmap(deps.assets, deps.cache, contentHash)
    deps.inFlight.delete(contentHash)
    if (decoded) {
      deps.onDecoded()
    }
  }
}

/**
 * Re-decode the project's underlays on open: for each underlay whose bitmap is
 * not yet in the cache (and not already decoding), resolve its bytes from the
 * asset cache and decode them, then bump the returned tick so the resolver memo
 * re-runs and the underlay paints. The in-flight set guards against a double
 * decode across re-renders; the cancelled flag guards a post-unmount state set.
 */
export function useResolveUnderlaysOnOpen(
  graph: SceneGraph,
  assets: AssetCache,
  cache: BitmapCache,
): number {
  const [decodeTick, setDecodeTick] = useState(0)
  const inFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const inFlight = inFlightRef.current
    const known = new Set<string>([...cache.keys(), ...inFlight])
    const refs: UnderlayRef[] = graph.underlays.map((node) => ({
      contentHash: node.image.contentHash,
    }))
    const pending = underlaysNeedingDecode(refs, known)
    for (const contentHash of pending) {
      inFlight.add(contentHash)
    }
    void decodePendingUnderlays(pending, {
      assets,
      cache,
      inFlight,
      onDecoded: () => {
        if (!cancelled) {
          setDecodeTick((tick) => tick + 1)
        }
      },
    })
    return () => {
      cancelled = true
    }
  }, [graph, assets, cache])

  return decodeTick
}
