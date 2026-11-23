import {
  formatAssetReference,
  type AssetDescription,
  type AssetReference,
  type AssetResolution,
} from '../../core'
import { markCacheHeld, type ImageTextureOptions, type TextureAppearance } from '../../engine'

export type TextureStatus = 'loading' | 'ready' | 'failed'

export interface TextureState {
  status: TextureStatus
  appearance?: TextureAppearance
}

export interface TextureSource {
  resolve(reference: AssetReference): Promise<AssetResolution>
  describe(reference: AssetReference): Promise<AssetDescription | undefined>
}

type Texture = TextureAppearance['texture']

export interface TextureCacheOptions {
  source: TextureSource
  decode(bytes: Uint8Array, options: ImageTextureOptions): Promise<Texture>
  dispose(texture: Texture): void
}

export interface TextureCache {
  request(reference: AssetReference): Promise<void>
  get(reference: AssetReference): TextureState
  /**
   * Frees every texture the cache holds, one time each. A decode that settles after
   * `dispose()` is freed when it settles.
   */
  dispose(): void
}

function decodeKey(contentHash: string, colorSpace: ImageTextureOptions['colorSpace']): string {
  return JSON.stringify([contentHash, colorSpace])
}

type DecodeOnce = (key: string, bytes: Uint8Array, options: ImageTextureOptions) => Promise<Texture>

function createTextureStore(
  decode: TextureCacheOptions['decode'],
  disposeTexture: TextureCacheOptions['dispose'],
) {
  const decodes = new Map<string, Promise<Texture>>()
  const textures = new Set<Texture>()
  let disposed = false

  const decodeOnce: DecodeOnce = (key, bytes, options) => {
    const existing = decodes.get(key)
    if (existing) return existing
    const started = decode(bytes, options).then((texture) => {
      markCacheHeld(texture)
      if (disposed) disposeTexture(texture)
      else textures.add(texture)
      return texture
    })
    decodes.set(key, started)
    return started
  }

  function dispose(): void {
    disposed = true
    for (const texture of textures) disposeTexture(texture)
  }

  return { decodeOnce, dispose }
}

interface CacheEntry {
  state: TextureState
  settled: Promise<void>
}

export const LOADING: TextureState = { status: 'loading' }
const FAILED: TextureState = { status: 'failed' }

async function loadTexture(
  source: TextureSource,
  decodeOnce: DecodeOnce,
  reference: AssetReference,
): Promise<TextureState> {
  try {
    const [description, resolution] = await Promise.all([
      source.describe(reference),
      source.resolve(reference),
    ])
    if (description?.kind !== 'texture' || resolution.outcome !== 'resolved') return FAILED
    const { mediaType, colorSpace, tileSize } = description
    const texture = await decodeOnce(
      decodeKey(reference.contentHash, colorSpace),
      resolution.bytes,
      { mediaType, colorSpace },
    )
    return { status: 'ready', appearance: { texture, tileSize } }
  } catch (reason) {
    console.warn(`Failed to load texture ${reference.contentHash}`, reason)
    return FAILED
  }
}

export function createTextureCache({ source, decode, dispose }: TextureCacheOptions): TextureCache {
  const { decodeOnce, dispose: disposeTextures } = createTextureStore(decode, dispose)
  const entries = new Map<string, CacheEntry>()

  return {
    request(reference) {
      const key = formatAssetReference(reference)
      const existing = entries.get(key)
      if (existing) return existing.settled
      const entry: CacheEntry = {
        state: LOADING,
        settled: loadTexture(source, decodeOnce, reference).then((state) => {
          entry.state = state
        }),
      }
      entries.set(key, entry)
      return entry.settled
    },
    get(reference) {
      return entries.get(formatAssetReference(reference))?.state ?? LOADING
    },
    dispose: disposeTextures,
  }
}
