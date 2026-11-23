import { describe, expect, it } from 'vitest'
import { checkPackIntegrity } from './pack-integrity.mjs'
import { TEXTURE_LIMITS } from '../../core/assets/texture-asset-rules.ts'
import { TEXTURE_SIDE, rgbPng, thumbnailSignature } from './texture-test-bytes.mjs'

const HASH = 'a'.repeat(64)
const MODEL_FILE = `assets/${HASH}.glb`
const THUMBNAIL_FILE = `thumbnails/${HASH}.webp`
const MODEL_BYTES = Uint8Array.of(1, 2, 3)

/** A reader for a pack with one `.glb` asset file, optionally without its thumbnail. */
function readerWithModelFile({ withThumbnail = true } = {}) {
  const files = new Set([MODEL_FILE, 'LICENSE', 'NOTICE', 'CHANGELOG.md'])
  const listings = { assets: [`${HASH}.glb`], thumbnails: [] }
  if (withThumbnail) {
    files.add(THUMBNAIL_FILE)
    listings.thumbnails = [`${HASH}.webp`]
  }
  const thumbnailBytes = thumbnailSignature()
  return {
    dirName: 'grass-pack-1.0.0',
    listDir: async (relative) => listings[relative] ?? [],
    exists: async (relative) => files.has(relative),
    sha256: async () => HASH,
    readBytes: async (relative) => (relative === MODEL_FILE ? MODEL_BYTES : thumbnailBytes),
    size: async (relative) =>
      relative === MODEL_FILE ? MODEL_BYTES.length : thumbnailBytes.length,
  }
}

function manifestOf(formatVersion, asset) {
  return { packId: 'grass-pack', version: '1.0.0', formatVersion, assets: [asset] }
}

const textureKindWithoutMediaType = { contentHash: HASH, kind: 'texture', name: 'Grass' }

describe('checkPackIntegrity for a texture kind in a format 1 pack', () => {
  it('reads the asset as a model and reports no error for a well-formed pack', async () => {
    const manifest = manifestOf(1, textureKindWithoutMediaType)
    const result = await checkPackIntegrity(manifest, readerWithModelFile())
    expect(result).toEqual({ errors: [] })
  })

  it('reports the model thumbnail error and no texture file error when the thumbnail is missing', async () => {
    const manifest = manifestOf(1, textureKindWithoutMediaType)
    const result = await checkPackIntegrity(manifest, readerWithModelFile({ withThumbnail: false }))
    expect(result.errors).toEqual([`asset ${HASH}: thumbnail missing`])
  })
})

describe('checkPackIntegrity for a texture kind without a media type in a format 2 pack', () => {
  it('resolves and reports an error for the asset instead of throwing', async () => {
    const manifest = manifestOf(2, textureKindWithoutMediaType)
    const result = await checkPackIntegrity(manifest, readerWithModelFile())
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
  })
})

const TEXTURE_FILE = `assets/${HASH}.png`
const TEXTURE_BYTES = rgbPng(TEXTURE_SIDE)
const TILE_MILLIMETRES = 1000
const oversizedBytes = TEXTURE_LIMITS.maxFileBytes + 1

const validTexture = {
  contentHash: HASH,
  kind: 'texture',
  name: 'Grass',
  mediaType: 'image/png',
  image: { width: TEXTURE_SIDE, height: TEXTURE_SIDE },
  tileSize: { width: TILE_MILLIMETRES, height: TILE_MILLIMETRES },
  colorSpace: 'srgb',
}

/** A reader for a pack with one valid PNG texture, reporting `textureSize` for its file. */
function readerWithTextureFile({ withThumbnail = true, textureSize = TEXTURE_BYTES.length } = {}) {
  const files = new Set([TEXTURE_FILE, 'LICENSE', 'NOTICE', 'CHANGELOG.md'])
  const listings = { assets: [`${HASH}.png`], thumbnails: [] }
  if (withThumbnail) {
    files.add(THUMBNAIL_FILE)
    listings.thumbnails = [`${HASH}.webp`]
  }
  const thumbnailBytes = thumbnailSignature()
  return {
    dirName: 'grass-pack-1.0.0',
    listDir: async (relative) => listings[relative] ?? [],
    exists: async (relative) => files.has(relative),
    sha256: async () => HASH,
    readBytes: async (relative, length) =>
      relative === TEXTURE_FILE ? TEXTURE_BYTES.subarray(0, length) : thumbnailBytes,
    size: async (relative) => (relative === TEXTURE_FILE ? textureSize : thumbnailBytes.length),
  }
}

describe('checkPackIntegrity for a valid texture in a format 2 pack', () => {
  it('reports only the size error for a texture file one byte above the limit', async () => {
    const reader = readerWithTextureFile({ textureSize: oversizedBytes })
    const result = await checkPackIntegrity(manifestOf(2, validTexture), reader)
    expect(result.errors).toEqual([
      `asset ${HASH}: file is ${oversizedBytes} bytes, above the 8 MiB (8388608 byte) limit for a texture`,
    ])
  })

  it('treats the thumbnail as optional', async () => {
    const reader = readerWithTextureFile({ withThumbnail: false })
    const result = await checkPackIntegrity(manifestOf(2, validTexture), reader)
    expect(result.errors).toEqual([])
  })
})
