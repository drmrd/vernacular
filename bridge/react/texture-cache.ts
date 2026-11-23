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
}

function decodeKey(contentHash: string, colorSpace: ImageTextureOptions['colorSpace']): string {
  return JSON.stringify([contentHash, colorSpace])
}

function createSharedDecoder(decode: TextureCacheOptions['decode']) {
  const decodes = new Map<string, Promise<Texture>>()

  return function decodeOnce(
    key: string,
    bytes: Uint8Array,
    options: ImageTextureOptions,
  ): Promise<Texture> {
    const existing = decodes.get(key)
    if (existing) return existing
    const started = decode(bytes, options).then((texture) => {
      markCacheHeld(texture)
      return texture
    })
    decodes.set(key, started)
    return started
  }
}

interface CacheEntry {
  state: TextureState
  settled: Promise<void>
}

const LOADING: TextureState = { status: 'loading' }
const FAILED: TextureState = { status: 'failed' }

async function loadTexture(
  source: TextureSource,
  decodeOnce: ReturnType<typeof createSharedDecoder>,
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

export function createTextureCache({ source, decode }: TextureCacheOptions): TextureCache {
  const decodeOnce = createSharedDecoder(decode)
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
  }
}
