import { useEffect, useRef, useState } from 'react'
import type { SceneGraph, UnderlaySceneNode } from '../../core'
import type { AssetCache } from '../../bridge'
import type { NotifyUser } from './notify-user'
import { underlaysNeedingDecode, type UnderlayRef } from './underlay-resolve'

// The resolve-on-open half of the underlay persistence round trip: re-decode each
// saved underlay's source bytes from the asset cache back into the in-memory
// bitmap cache so a placed underlay repaints after a reload. The write-on-load
// half lives in `use-load-underlay-image.ts`. See ADR-0042.

type BitmapCache = Map<string, ImageBitmap>

// The two reasons a saved underlay never comes back, in the words the user reads.
const MISSING_UNDERLAY_IMAGE_MESSAGE =
  "An underlay image is missing from this project's storage. Load it again from the underlay menu."
const UNREADABLE_UNDERLAY_IMAGE_MESSAGE =
  'An underlay image in this project could not be decoded. Load it again from the underlay menu.'

interface DecodeDeps {
  assets: AssetCache
  cache: BitmapCache
  inFlight: Set<string>
  failed: Set<string>
  notify: NotifyUser
  onDecoded: () => void
}

// Resolve one underlay's source bytes from the asset cache and decode them into
// the bitmap cache. Returns true when a bitmap was cached. A missing asset (the
// backend did not persist it) or a decode failure still leaves the underlay
// undrawn (returns false), but the user is told which of the two happened and
// what to do about it rather than the open degrading in silence.
async function resolveUnderlayBitmap(deps: DecodeDeps, contentHash: string): Promise<boolean> {
  try {
    const bytes = await deps.assets.get(contentHash)
    if (bytes === undefined) {
      deps.notify(MISSING_UNDERLAY_IMAGE_MESSAGE)
      return false
    }
    deps.cache.set(contentHash, await createImageBitmap(new Blob([new Uint8Array(bytes)])))
    return true
  } catch (error) {
    console.error('Failed to resolve underlay image', error)
    deps.notify(UNREADABLE_UNDERLAY_IMAGE_MESSAGE)
    return false
  }
}

// Only raster underlays decode to a bitmap; document and scene sources resolve
// through their own pipelines, so they contribute no decode ref here.
function rasterDecodeRefs(node: UnderlaySceneNode): UnderlayRef[] {
  return node.source.kind === 'raster' ? [{ contentHash: node.source.image.contentHash }] : []
}

// Decode each pending hash in turn, clearing its in-flight mark and signalling a
// repaint after each success so a resolved underlay paints as soon as it is ready.
// A hash that fails joins the failed set, which keeps a later effect run from
// re-fetching it and telling the user the same thing twice.
async function decodePendingUnderlays(pending: readonly string[], deps: DecodeDeps): Promise<void> {
  for (const contentHash of pending) {
    const decoded = await resolveUnderlayBitmap(deps, contentHash)
    deps.inFlight.delete(contentHash)
    if (decoded) {
      deps.onDecoded()
    } else {
      deps.failed.add(contentHash)
    }
  }
}

export interface ResolveUnderlaysOptions {
  graph: SceneGraph
  assets: AssetCache
  cache: BitmapCache
  notify: NotifyUser
}

/**
 * Re-decode the project's underlays on open: for each underlay whose bitmap is
 * not yet in the cache (and not already decoding, and not already known to have
 * failed), resolve its bytes from the asset cache and decode them, then bump the
 * returned tick so the resolver memo re-runs and the underlay paints. The
 * in-flight set guards against a double decode across re-renders; the failed set
 * keeps each unresolvable underlay to a single report for the hook's lifetime;
 * the cancelled flag guards a post-unmount state set.
 */
export function useResolveUnderlaysOnOpen({
  graph,
  assets,
  cache,
  notify,
}: ResolveUnderlaysOptions): number {
  const [decodeTick, setDecodeTick] = useState(0)
  const inFlightRef = useRef<Set<string>>(new Set())
  const failedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const inFlight = inFlightRef.current
    const failed = failedRef.current
    const known = new Set<string>([...cache.keys(), ...inFlight, ...failed])
    const refs: UnderlayRef[] = graph.underlays.flatMap(rasterDecodeRefs)
    const pending = underlaysNeedingDecode(refs, known)
    for (const contentHash of pending) {
      inFlight.add(contentHash)
    }
    void decodePendingUnderlays(pending, {
      assets,
      cache,
      inFlight,
      failed,
      notify,
      onDecoded: () => {
        if (!cancelled) {
          setDecodeTick((tick) => tick + 1)
        }
      },
    })
    return () => {
      cancelled = true
    }
  }, [graph, assets, cache, notify])

  return decodeTick
}
