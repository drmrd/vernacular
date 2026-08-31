import { useCallback } from 'react'
import { createUnderlay, placeUnderlay, type AssetReference } from '../../core'
import { useActiveFloorId, type AssetCache, type EditorSession } from '../../bridge'
import type { NotifyUser } from './use-underlay'

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
  // The floor the loaded underlay is placed on (the active floor); null before any
  // floor is selected.
  activeFloorId: string | null
  notify: NotifyUser
}

// The two reasons a picked image never reaches the floor, in the words the user reads.
const MISSING_FLOOR_MESSAGE = 'Add a floor before loading an underlay.'
const UNREADABLE_IMAGE_MESSAGE = 'That image could not be loaded. Choose a PNG or JPEG file.'

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
// onto the active floor (falling back to the first floor before any floor is
// selected). No floor means nothing to place, so the load is dropped and the user
// is told to add one. The image bytes are read once: the same buffer feeds the
// content hash, the bitmap decode, and the durable write. A failed read, hash, or
// decode is logged and reported to the user through notify.
export async function loadImageFile(file: File, deps: LoadImageDeps): Promise<void> {
  const floorId = deps.activeFloorId ?? deps.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    deps.notify(MISSING_FLOOR_MESSAGE)
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
    deps.notify(UNREADABLE_IMAGE_MESSAGE)
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

export interface LoadImageOptions {
  session: EditorSession
  cache: BitmapCache
  assets: AssetCache
  notify: NotifyUser
}

/** Open a file picker and run the write-on-load round trip for the chosen image. */
export function useLoadImage({ session, cache, assets, notify }: LoadImageOptions): () => void {
  const activeFloorId = useActiveFloorId()
  return useCallback(() => {
    pickImageFile((file) => {
      void loadImageFile(file, { session, cache, assets, activeFloorId, notify })
    })
  }, [session, cache, assets, activeFloorId, notify])
}
