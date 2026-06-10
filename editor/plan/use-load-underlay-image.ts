import { useCallback } from 'react'
import { createUnderlay, placeUnderlay, type AssetReference } from '../../core'
import { type AssetCache, type EditorSession } from '../../bridge'

// The write-on-load half of the underlay persistence round trip: pick a raster
// file, decode it, persist its source bytes through the asset cache, and place
// the underlay on the active floor. The resolve-on-open half lives in
// `use-resolve-underlays.ts`. See ADR-0042.

type BitmapCache = Map<string, ImageBitmap>

const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2

// Hex-encode the SHA-256 digest of the image bytes; this is the content hash the
// asset reference and the bitmap cache key share.
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0'))
    .join('')
}

interface LoadImageDeps {
  session: EditorSession
  cache: BitmapCache
  assets: AssetCache
}

// Persist the underlay's source bytes through the asset cache, best-effort: a
// failed put is logged but does not block placing the underlay (the in-memory
// bitmap still renders for this session). The durable write closes the
// "zero state loss" gap when the backend persists assets (ADR-0042).
async function persistUnderlayBytes(
  assets: AssetCache,
  contentHash: string,
  bytes: ArrayBuffer,
): Promise<void> {
  try {
    await assets.put(contentHash, new Uint8Array(bytes))
  } catch (error) {
    console.error('Failed to persist underlay image bytes', error)
  }
}

// Decode the chosen file, cache the bitmap under its content hash, persist the
// source bytes through the asset cache, and dispatch a place-underlay command
// onto the project's first floor. No floor means nothing to place, so the load is
// dropped. The image bytes are read once: the same buffer feeds the content hash,
// the bitmap decode, and the durable write. A failed read, hash, or decode is
// logged; a user-facing toast is a documented follow-up.
async function loadImageFile(file: File, deps: LoadImageDeps): Promise<void> {
  const floorId = deps.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    return
  }
  try {
    const bytes = await file.arrayBuffer()
    const contentHash = await sha256Hex(bytes)
    const bitmap = await createImageBitmap(new Blob([bytes], { type: file.type }))
    deps.cache.set(contentHash, bitmap)
    await persistUnderlayBytes(deps.assets, contentHash, bytes)
    const image: AssetReference = { scope: 'project', contentHash }
    const underlay = createUnderlay({ image, width: bitmap.width, height: bitmap.height })
    deps.session.dispatch(placeUnderlay(floorId, underlay))
  } catch (error) {
    console.error('Failed to load underlay image', error)
  }
}

// A transient file input clicked programmatically; created per pick so it does
// not need to live in the React tree.
function pickImageFile(onFile: (file: File) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) {
      onFile(file)
    }
  })
  input.click()
}

/** Open a file picker and run the write-on-load round trip for the chosen image. */
export function useLoadImage(
  session: EditorSession,
  cache: BitmapCache,
  assets: AssetCache,
): () => void {
  return useCallback(() => {
    pickImageFile((file) => {
      void loadImageFile(file, { session, cache, assets })
    })
  }, [session, cache, assets])
}
