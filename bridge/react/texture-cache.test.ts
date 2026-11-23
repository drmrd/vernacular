import { describe, it, expect, vi } from 'vitest'
import { resolvedAsset } from '../../core'
import type { AssetReference, TextureDescription } from '../../core'
import { Texture, isCacheHeld } from '../../engine/testing'
import { createTextureCache } from './texture-cache'

const reference: AssetReference = { scope: 'pack:grass@1.0.0', contentHash: 'sha256-grass' }
const bytes = new Uint8Array([1, 2, 3])
const description: TextureDescription = {
  kind: 'texture',
  mediaType: 'image/png',
  image: { width: 512, height: 768 },
  tileSize: { width: 1000, height: 1500 },
  colorSpace: 'srgb',
}

describe('createTextureCache', () => {
  it('a requested texture loads once and settles ready with the tile size of its own reference', async () => {
    const decoded = new Texture()
    const resolve = vi.fn(async () => resolvedAsset(bytes, reference.scope))
    const describeAsset = vi.fn(async () => description)
    const decode = vi.fn(async () => decoded)
    const cache = createTextureCache({
      source: { resolve, describe: describeAsset },
      decode,
      dispose: () => {},
    })

    await Promise.all([cache.request(reference), cache.request(reference)])

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(describeAsset).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledWith(bytes, { mediaType: 'image/png', colorSpace: 'srgb' })
    expect(cache.get(reference)).toEqual({
      status: 'ready',
      appearance: { texture: decoded, tileSize: { width: 1000, height: 1500 } },
    })
    expect(isCacheHeld(decoded)).toBe(true)
  })

  it('two references to one image with one color space share one decoded texture and keep their own tile sizes', async () => {
    const small: AssetReference = { scope: 'pack:lawn@1.0.0', contentHash: 'sha256-grass' }
    const large: AssetReference = { scope: 'pack:meadow@1.0.0', contentHash: 'sha256-grass' }
    const tileSizes = new Map([
      [small.scope, { width: 1000, height: 1000 }],
      [large.scope, { width: 2000, height: 2000 }],
    ])
    const decode = vi.fn(async () => new Texture())
    const cache = createTextureCache({
      source: {
        resolve: async (asset) => resolvedAsset(bytes, asset.scope),
        describe: async (asset) => ({ ...description, tileSize: tileSizes.get(asset.scope)! }),
      },
      decode,
      dispose: () => {},
    })

    await Promise.all([cache.request(small), cache.request(large)])

    const smallState = cache.get(small)
    const largeState = cache.get(large)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(smallState.appearance?.texture).toBe(largeState.appearance?.texture)
    expect(smallState.appearance?.tileSize).toEqual({ width: 1000, height: 1000 })
    expect(largeState.appearance?.tileSize).toEqual({ width: 2000, height: 2000 })
  })
})
