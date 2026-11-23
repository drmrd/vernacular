import { useEffect, useState } from 'react'
import { formatAssetReference, parseAssetReference, type AssetReference } from '../../core'
import { decodeImageTexture, disposeImageTexture } from '../../engine'
import { createTextureCache, LOADING, type TextureSource, type TextureState } from './texture-cache'

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored. `source` must keep the same identity across
 * renders, or the hook reloads the texture on each render.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const [state, setState] = useState<TextureState>(LOADING)
  const referenceKey = formatAssetReference(reference)

  useEffect(() => {
    let cancelled = false
    const cache = createTextureCache({
      source,
      decode: decodeImageTexture,
      dispose: disposeImageTexture,
    })
    const textureReference = parseAssetReference(referenceKey)
    void cache.request(textureReference).then(() => {
      if (!cancelled) setState(cache.get(textureReference))
    })
    return () => {
      cancelled = true
      cache.dispose()
    }
  }, [referenceKey, source])

  return state
}
