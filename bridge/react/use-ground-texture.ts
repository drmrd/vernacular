import { useEffect, useState } from 'react'
import { formatAssetReference, type AssetReference } from '../../core'
import { decodeImageTexture, type TextureAppearance } from '../../engine'
import { createTextureCache, type TextureSource, type TextureState } from './texture-cache'

const LOADING: TextureState = { status: 'loading' }

function disposeTexture(texture: TextureAppearance['texture']): void {
  texture.dispose()
  const image: unknown = texture.image
  if (image && typeof (image as { close?: unknown }).close === 'function') {
    ;(image as { close(): void }).close()
  }
}

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const [state, setState] = useState<TextureState>(LOADING)
  const referenceKey = formatAssetReference(reference)

  useEffect(() => {
    let cancelled = false
    const cache = createTextureCache({
      source,
      decode: (bytes, options) => decodeImageTexture(bytes, options),
      dispose: disposeTexture,
    })
    void cache.request(reference).then(() => {
      if (!cancelled) setState(cache.get(reference))
    })
    return () => {
      cancelled = true
      cache.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the reference's string form
  }, [referenceKey, source])

  return state
}
