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

export function createTextureCache({ source, decode }: TextureCacheOptions): TextureCache {
  const loads = new Map<string, Promise<void>>()
  const settled = new Map<string, TextureState>()

  async function load(reference: AssetReference): Promise<void> {
    const [description, resolution] = await Promise.all([
      source.describe(reference),
      source.resolve(reference),
    ])
    const { mediaType, colorSpace, tileSize } = description as TextureDescription
    const texture = await decode((resolution as ResolvedAsset).bytes, { mediaType, colorSpace })
    markCacheHeld(texture)
    settled.set(formatAssetReference(reference), {
      status: 'ready',
      appearance: { texture, tileSize },
    })
  }

  return {
    request(reference) {
      const key = formatAssetReference(reference)
      const inFlight = loads.get(key) ?? load(reference)
      loads.set(key, inFlight)
      return inFlight
    },
    get(reference) {
      return settled.get(formatAssetReference(reference)) ?? { status: 'loading' }
    },
  }
}
