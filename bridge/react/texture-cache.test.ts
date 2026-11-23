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
})
