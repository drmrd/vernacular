import {
  formatAssetReference,
  type AssetDescription,
  type AssetReference,
  type AssetResolution,
  type ResolvedAsset,
  type TextureDescription,
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

function createSharedDecoder(decode: TextureCacheOptions['decode']) {
  const decodes = new Map<string, Promise<Texture>>()

  return function decodeOnce(
    contentHash: string,
    bytes: Uint8Array,
    options: ImageTextureOptions,
  ): Promise<Texture> {
    const existing = decodes.get(contentHash)
    if (existing) return existing
    const started = decode(bytes, options).then((texture) => {
      markCacheHeld(texture)
      return texture
    })
    decodes.set(contentHash, started)
    return started
  }
}

export function createTextureCache({ source, decode }: TextureCacheOptions): TextureCache {
  const decodeOnce = createSharedDecoder(decode)
  const loads = new Map<string, Promise<void>>()
  const settled = new Map<string, TextureState>()
  async function load(reference: AssetReference, key: string): Promise<void> {
    const [description, resolution] = await Promise.all([
      source.describe(reference),
      source.resolve(reference),
    ])
    const { mediaType, colorSpace, tileSize } = description as TextureDescription
    const texture = await decodeOnce(reference.contentHash, (resolution as ResolvedAsset).bytes, {
      mediaType,
      colorSpace,
    })
    settled.set(key, {
      status: 'ready',
      appearance: { texture, tileSize },
    })
  }

  return {
    request(reference) {
      const key = formatAssetReference(reference)
      const existing = loads.get(key)
      if (existing) return existing
      const started = load(reference, key)
      loads.set(key, started)
      return started
    },
    get(reference) {
      return settled.get(formatAssetReference(reference)) ?? { status: 'loading' }
    },
  }
}
