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

/**
 * The cache lives inside one effect so that StrictMode's re-run builds a fresh cache, and a
 * load that settles after cleanup is ignored. `source` must keep the same identity across
 * renders, or the hook reloads the texture on each render. A state from an earlier reference or
 * source is never returned, for two reasons. The render that sees a new reference or source drops
 * the settled state, so a reference that returns to an earlier value does not show a texture the
 * cache already freed. The settled state also carries the inputs of the effect run that settled
 * it and is returned only while they match the current inputs, because a non-urgent commit runs
 * the old effect's cleanup after the new inputs commit, and the old load can settle in between.
 */
export function useGroundTexture(reference: AssetReference, source: TextureSource): TextureState {
  const referenceKey = formatAssetReference(reference)
  const [settled, setSettled] = useState<SettledTexture | undefined>(undefined)
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

  const settledForCurrentInputs =
    settled !== undefined && settled.inputs.key === referenceKey && settled.inputs.source === source
  return inputsChanged || !settledForCurrentInputs ? LOADING : settled.state
}
