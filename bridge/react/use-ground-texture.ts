import { useEffect, useState } from 'react'
import { formatAssetReference, parseAssetReference, type AssetReference } from '../../core'
import { decodeImageTexture, disposeImageTexture } from '../../engine'
import { createTextureCache, LOADING, type TextureSource, type TextureState } from './texture-cache'

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored. `source` must keep the same identity across
 * renders, or the hook reloads the texture on each render. A state from an earlier reference or
 * source is never returned.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const [settled, setSettled] = useState<
    { key: string; source: TextureSource; state: TextureState } | undefined
  >(undefined)
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
      if (!cancelled) {
        setSettled({ key: referenceKey, source, state: cache.get(textureReference) })
      }
    })
    return () => {
      cancelled = true
      cache.dispose()
    }
  }, [referenceKey, source])

  return settled?.key === referenceKey && settled.source === source ? settled.state : LOADING
}
