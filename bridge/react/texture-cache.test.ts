import { afterEach, describe, it, expect, vi } from 'vitest'
import { missingAsset, resolvedAsset } from '../../core'
import type {
  AssetDescription,
  AssetReference,
  AssetResolution,
  ModelDescription,
  TextureDescription,
} from '../../core'
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

const modelDescription: ModelDescription = {
  kind: 'model',
  mediaType: 'model/gltf-binary',
  dimensions: { width: 1000, depth: 500, height: 800 },
}

function cacheFor(
  describeFor: (asset: AssetReference) => TextureDescription,
  decode: () => Promise<Texture>,
) {
  const dispose = vi.fn<(texture: Texture) => void>()
  const cache = createTextureCache({
    source: {
      resolve: async (asset) => resolvedAsset(bytes, asset.scope),
      describe: async (asset) => describeFor(asset),
    },
    decode,
    dispose,
  })
  return { cache, dispose }
}

afterEach(() => {
  vi.restoreAllMocks()
})

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
    const decode = vi.fn(async () => new Texture())
    const { cache } = cacheFor(
      (asset) => ({
        ...description,
        tileSize:
          asset.scope === small.scope
            ? { width: 1000, height: 1000 }
            : { width: 2000, height: 2000 },
      }),
      decode,
    )

    await Promise.all([cache.request(small), cache.request(large)])

    const smallState = cache.get(small)
    const largeState = cache.get(large)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(smallState.appearance?.texture).toBe(largeState.appearance?.texture)
    expect(isCacheHeld(smallState.appearance?.texture as Texture)).toBe(true)
    expect(smallState.appearance?.tileSize).toEqual({ width: 1000, height: 1000 })
    expect(largeState.appearance?.tileSize).toEqual({ width: 2000, height: 2000 })
  })

  it('the same image with another color space is decoded again', async () => {
    const color: AssetReference = { scope: 'pack:lawn@1.0.0', contentHash: 'sha256-grass' }
    const data: AssetReference = { scope: 'pack:lawn-data@1.0.0', contentHash: 'sha256-grass' }
    const decode = vi.fn(async () => new Texture())
    const { cache } = cacheFor(
      (asset) => ({ ...description, colorSpace: asset.scope === color.scope ? 'srgb' : 'linear' }),
      decode,
    )

    await Promise.all([cache.request(color), cache.request(data)])

    expect(decode).toHaveBeenCalledTimes(2)
    expect(decode).toHaveBeenCalledWith(bytes, { mediaType: 'image/png', colorSpace: 'srgb' })
    expect(decode).toHaveBeenCalledWith(bytes, { mediaType: 'image/png', colorSpace: 'linear' })
    const colorTexture = cache.get(color).appearance?.texture as Texture
    const dataTexture = cache.get(data).appearance?.texture as Texture
    expect(colorTexture).not.toBe(dataTexture)
    expect(isCacheHeld(colorTexture)).toBe(true)
    expect(isCacheHeld(dataTexture)).toBe(true)
  })
})

interface FailureScenario {
  name: string
  resolveAsset: () => Promise<AssetResolution>
  describeAsset: () => Promise<AssetDescription | undefined>
  decodeAsset: () => Promise<Texture>
  reachesDecode: boolean
}

async function requestFailure(scenario: FailureScenario) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const decode = vi.fn(scenario.decodeAsset)
  const dispose = vi.fn()
  const cache = createTextureCache({
    source: { resolve: scenario.resolveAsset, describe: scenario.describeAsset },
    decode,
    dispose,
  })

  await expect(cache.request(reference)).resolves.toBeUndefined()

  expect(cache.get(reference)).toEqual({ status: 'failed' })
  expect(dispose).not.toHaveBeenCalled()
  expect(decode.mock.calls.length > 0).toBe(scenario.reachesDecode)
  return warn
}

describe('createTextureCache failure handling', () => {
  const corruptImage = new Error('corrupt image')
  const describeFailure = new Error('description store unavailable')
  const resolveFailure = new Error('pack store unavailable')

  it.each<FailureScenario & { rejection: Error }>([
    {
      name: 'that does not decode',
      resolveAsset: async () => resolvedAsset(bytes, reference.scope),
      describeAsset: async () => description,
      decodeAsset: async () => {
        throw corruptImage
      },
      reachesDecode: true,
      rejection: corruptImage,
    },
    {
      name: 'whose description lookup rejects',
      resolveAsset: async () => resolvedAsset(bytes, reference.scope),
      describeAsset: async () => {
        throw describeFailure
      },
      decodeAsset: async () => new Texture(),
      reachesDecode: false,
      rejection: describeFailure,
    },
    {
      name: 'whose image lookup rejects',
      resolveAsset: async () => {
        throw resolveFailure
      },
      describeAsset: async () => description,
      decodeAsset: async () => new Texture(),
      reachesDecode: false,
      rejection: resolveFailure,
    },
  ])('a texture $name settles as failed and disposes nothing', async (scenario) => {
    const warn = await requestFailure(scenario)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(reference.contentHash),
      scenario.rejection,
    )
  })

  it.each<FailureScenario & { reason: string }>([
    {
      name: 'with no description',
      resolveAsset: async () => resolvedAsset(bytes, reference.scope),
      describeAsset: async () => undefined,
      decodeAsset: async () => new Texture(),
      reachesDecode: false,
      reason: 'no description for the asset',
    },
    {
      name: 'of another kind',
      resolveAsset: async () => resolvedAsset(bytes, reference.scope),
      describeAsset: async () => modelDescription,
      decodeAsset: async () => new Texture(),
      reachesDecode: false,
      reason: `description kind is ${modelDescription.kind}, not texture`,
    },
    {
      name: 'whose image is missing',
      resolveAsset: async () => missingAsset(reference),
      describeAsset: async () => description,
      decodeAsset: async () => new Texture(),
      reachesDecode: false,
      reason: `image is missing: the asset did not resolve in ${reference.scope}`,
    },
  ])(
    'a texture $name fails without an error and warns once with its hash and reason',
    async (scenario) => {
      const warn = await requestFailure(scenario)

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `Failed to load texture ${reference.contentHash}`,
        scenario.reason,
      )
    },
  )
})

describe('createTextureCache disposal', () => {
  const lawn: AssetReference = { scope: 'pack:lawn@1.0.0', contentHash: 'sha256-grass' }
  const meadow: AssetReference = { scope: 'pack:meadow@1.0.0', contentHash: 'sha256-grass' }
  const lawnData: AssetReference = { scope: 'pack:lawn-data@1.0.0', contentHash: 'sha256-grass' }

  const cacheWithDisposer = (decode: () => Promise<Texture>) =>
    cacheFor(
      (asset) => ({
        ...description,
        colorSpace: asset.scope === lawnData.scope ? 'linear' : 'srgb',
      }),
      decode,
    )

  it('the cache frees each texture once, when the cache is disposed, and never before', async () => {
    const { cache, dispose } = cacheWithDisposer(async () => new Texture())
    const references = [lawn, meadow, lawnData]

    await Promise.all(references.map((asset) => cache.request(asset)))
    for (let round = 0; round < 5; round += 1) {
      await Promise.all(references.map((asset) => cache.request(asset)))
      references.forEach((asset) => cache.get(asset))
    }

    expect(dispose).not.toHaveBeenCalled()

    const sharedTexture = cache.get(lawn).appearance?.texture
    const dataTexture = cache.get(lawnData).appearance?.texture
    expect(sharedTexture).not.toBe(dataTexture)

    cache.dispose()

    expect(dispose).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledWith(sharedTexture)
    expect(dispose).toHaveBeenCalledWith(dataTexture)
  })

  it('a texture that finishes decoding after the cache is disposed is freed', async () => {
    const late = new Texture()
    let finishDecode: (texture: Texture) => void = () => {}
    let decodeStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => (decodeStarted = resolve))
    const { cache, dispose } = cacheWithDisposer(
      () =>
        new Promise<Texture>((resolve) => {
          finishDecode = resolve
          decodeStarted()
        }),
    )

    const loading = cache.request(lawn)
    await started
    cache.dispose()
    finishDecode(late)
    await loading

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith(late)
  })
})
