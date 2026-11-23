import { useEffect, useState } from 'react'
import { formatAssetReference, parseAssetReference, type AssetReference } from '../../core'
import { decodeImageTexture, disposeImageTexture } from '../../engine'
import { createTextureCache, LOADING, type TextureSource, type TextureState } from './texture-cache'

interface TextureInputs {
  readonly key: string
  readonly source: TextureSource
}

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored. `source` must keep the same identity across
 * renders, or the hook reloads the texture on each render. A state from an earlier reference or
 * source is never returned: the render that sees a new reference or source drops the settled
 * state and returns LOADING, so only a load settled by the current effect run is shown, even when
 * the reference or source returns to an earlier value whose texture the cache already freed.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const referenceKey = formatAssetReference(reference)
  const [settled, setSettled] = useState<TextureState | undefined>(undefined)
  const [seen, setSeen] = useState<TextureInputs>({ key: referenceKey, source })
  const inputsChanged = seen.key !== referenceKey || seen.source !== source
  if (inputsChanged) {
    setSeen({ key: referenceKey, source })
    setSettled(undefined)
  }

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
        setSettled(cache.get(textureReference))
      }
    })
    return () => {
      cancelled = true
      cache.dispose()
    }
  }, [referenceKey, source])

  return inputsChanged ? LOADING : (settled ?? LOADING)
}
