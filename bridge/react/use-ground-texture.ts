import { useEffect, useState } from 'react'
import { formatAssetReference, parseAssetReference, type AssetReference } from '../../core'
import { decodeImageTexture, disposeImageTexture } from '../../engine'
import { createTextureCache, LOADING, type TextureSource, type TextureState } from './texture-cache'

interface TextureInputs {
  readonly key: string
  readonly source: TextureSource
}

interface SettledTexture {
  readonly inputs: TextureInputs
  readonly state: TextureState
}

function sameInputs(a: TextureInputs, b: TextureInputs): boolean {
  return a.key === b.key && a.source === b.source
}

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored. `source` must keep the same identity across
 * renders, or the hook reloads the texture on each render. A state from an earlier reference or
 * source is never returned. The render that sees new inputs drops the settled state, so a return
 * to an earlier value never shows a texture the cache already freed. The settled state also
 * carries the inputs of its effect run and shows only while they match, because a non-urgent
 * commit runs the old cleanup after the new inputs commit and the old load can settle in between.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const referenceKey = formatAssetReference(reference)
  const [settled, setSettled] = useState<SettledTexture | undefined>(undefined)
  const inputs: TextureInputs = { key: referenceKey, source }
  const [seen, setSeen] = useState<TextureInputs>(inputs)
  if (!sameInputs(seen, inputs)) {
    setSeen(inputs)
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
        setSettled({
          inputs: { key: referenceKey, source },
          state: cache.get(textureReference),
        })
      }
    })
    return () => {
      cancelled = true
      cache.dispose()
    }
  }, [referenceKey, source])

  const settledForCurrentInputs = settled !== undefined && sameInputs(settled.inputs, inputs)
  return settledForCurrentInputs ? settled.state : LOADING
}
