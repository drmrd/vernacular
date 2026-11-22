import { describe, expect, it, vi } from 'vitest'
import { checkPackIntegrity } from './pack-integrity.mjs'
import { runPackCli } from './vernacular-pack.mjs'
import { TEXTURE_LIMITS } from '../../core/assets/texture-asset-rules.ts'
import {
  TEXTURE_SIDE,
  animatedWebp,
  lossyWebp,
  rgbPng,
  thumbnailSignature,
} from './texture-test-bytes.mjs'

const HASH = 'a'.repeat(64)
const SMALLER_SIDE = 128
const FILE_EXTENSIONS = { 'image/webp': 'webp', 'model/gltf-binary': 'glb' }
const FILE_LIMIT = TEXTURE_LIMITS.maxFileBytes

const PNG_IHDR_BIT_DEPTH_OFFSET = 24
const PNG_IHDR_COLOR_TYPE_OFFSET = 25
const PNG_IHDR_INTERLACE_OFFSET = 28
const PNG_AFTER_IHDR_OFFSET = 33
const BIT_DEPTH_SIXTEEN = 16
const COLOR_TYPE_PALETTE = 3
const ADAM7_INTERLACE = 1
const GAMA_CHUNK = [0, 0, 0, 4, 0x67, 0x41, 0x4d, 0x41, 0, 1, 0x86, 0xa0, 0x20, 0x0b, 0xcf, 0x8a]

// The readers do not check CRCs, so a patched IHDR byte keeps its old CRC harmlessly.
function withHeaderByte(bytes, offset, value) {
  const patched = Uint8Array.from(bytes)
  patched[offset] = value
  return patched
}

function withGamaChunk(bytes) {
  return Uint8Array.from([
    ...bytes.subarray(0, PNG_AFTER_IHDR_OFFSET),
    ...GAMA_CHUNK,
    ...bytes.subarray(PNG_AFTER_IHDR_OFFSET),
  ])
}

function textureAsset(mediaType = 'image/png') {
  return {
    contentHash: HASH,
    kind: 'texture',
    name: 'Grass',
    mediaType,
    image: { width: TEXTURE_SIDE, height: TEXTURE_SIDE },
    tileSize: { width: 1000, height: 1000 },
    colorSpace: 'srgb',
  }
}

/** A reader for a pack with one texture whose file holds `bytes`. */
function readerFor(asset, bytes, overrides = {}) {
  const extension = FILE_EXTENSIONS[asset.mediaType] ?? 'png'
  const file = `assets/${HASH}.${extension}`
  const thumbnailBytes = thumbnailSignature()
  const files = new Set([file, `thumbnails/${HASH}.webp`, 'LICENSE', 'NOTICE', 'CHANGELOG.md'])
  const listings = { assets: [`${HASH}.${extension}`], thumbnails: [`${HASH}.webp`] }
  return {
    dirName: 'grass-pack-1.0.0',
    listDir: async (relative) => listings[relative] ?? [],
    exists: async (relative) => files.has(relative),
    sha256: async () => HASH,
    readBytes: async (relative, length) =>
      relative === file ? bytes.subarray(0, length) : thumbnailBytes,
    size: async (relative) => (relative === file ? bytes.length : thumbnailBytes.length),
    ...overrides,
  }
}

function manifestOf(asset) {
  return { packId: 'grass-pack', version: '1.0.0', formatVersion: 2, assets: [asset] }
}

/** A format 2 pack with one texture whose file holds `bytes`. */
async function integrityOf(asset, bytes, overrides = {}) {
  return checkPackIntegrity(manifestOf(asset), readerFor(asset, bytes, overrides))
}

function withoutImage(asset) {
  const { image: _image, ...rest } = asset
  return rest
}

describe('checkPackIntegrity for a texture file', () => {
  it('reports no error for a PNG that matches its manifest entry', async () => {
    const result = await integrityOf(textureAsset(), rgbPng(TEXTURE_SIDE))
    expect(result).toEqual({ errors: [] })
  })

  it.each([
    ['WebP bytes for an image/png asset', /media type/i, lossyWebp(TEXTURE_SIDE, TEXTURE_SIDE)],
    ['a PNG smaller than the declared image size', /width|height|size/i, rgbPng(SMALLER_SIDE)],
    [
      'a PNG with a bit depth of 16',
      /bit depth/i,
      withHeaderByte(rgbPng(TEXTURE_SIDE), PNG_IHDR_BIT_DEPTH_OFFSET, BIT_DEPTH_SIXTEEN),
    ],
    [
      'an interlaced PNG',
      /interlace/i,
      withHeaderByte(rgbPng(TEXTURE_SIDE), PNG_IHDR_INTERLACE_OFFSET, ADAM7_INTERLACE),
    ],
    [
      'a palette PNG',
      /color type/i,
      withHeaderByte(rgbPng(TEXTURE_SIDE), PNG_IHDR_COLOR_TYPE_OFFSET, COLOR_TYPE_PALETTE),
    ],
    ['a PNG with a gAMA chunk', /gAMA|chunk/i, withGamaChunk(rgbPng(TEXTURE_SIDE))],
  ])('reports %s once, naming the asset', async (_label, keyword, bytes) => {
    const result = await integrityOf(textureAsset(), bytes)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(HASH)
    expect(result.errors[0]).toMatch(keyword)
  })

  it('reports an animated WebP once, naming the asset', async () => {
    const asset = textureAsset('image/webp')
    const result = await integrityOf(asset, animatedWebp(TEXTURE_SIDE, TEXTURE_SIDE))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(HASH)
    expect(result.errors[0]).toMatch(/animat/i)
  })

  it('asks to read as many texture bytes as the texture limit allows', async () => {
    const lengths = []
    const readBytes = async (relative, length) => {
      lengths.push(length)
      return rgbPng(TEXTURE_SIDE)
    }
    await integrityOf(textureAsset(), rgbPng(TEXTURE_SIDE), { readBytes })
    expect(lengths).toContain(TEXTURE_LIMITS.maxFileBytes)
  })

  it('gives one error for a hash-mismatched texture whose bytes are not an image', async () => {
    const reader = { sha256: async () => 'b'.repeat(64) }
    const result = await integrityOf(textureAsset(), Uint8Array.of(1, 2, 3), reader)
    expect(result.errors).toEqual([
      `asset ${HASH}: content hash does not match the file bytes of assets/${HASH}.png`,
    ])
  })

  it('gives one error for a missing texture file', async () => {
    const reader = { exists: async (relative) => !relative.startsWith('assets/') }
    const result = await integrityOf(textureAsset(), Uint8Array.of(1, 2, 3), reader)
    expect(result.errors).toEqual([`asset ${HASH}: asset file missing at assets/${HASH}.png`])
  })

  describe('for a texture file at the size limit', () => {
    const oversize = { size: async () => FILE_LIMIT + 1 }
    const namesTheLimit = new RegExp(`${HASH}.*${FILE_LIMIT}`)

    it.each([
      ['image/png', rgbPng(TEXTURE_SIDE)],
      ['image/webp', lossyWebp(TEXTURE_SIDE, TEXTURE_SIDE)],
    ])(
      'reports an %s file one byte above the limit once, naming the limit',
      async (type, bytes) => {
        const result = await integrityOf(textureAsset(type), bytes, oversize)
        expect(result.errors).toEqual([expect.stringMatching(namesTheLimit)])
      },
    )

    it('reports no size error for a file of exactly the limit', async () => {
      const exact = { size: async () => FILE_LIMIT }
      const result = await integrityOf(textureAsset(), rgbPng(TEXTURE_SIDE), exact)
      expect(result).toEqual({ errors: [] })
    })

    it('does not apply the limit to a model file', async () => {
      const model = {
        contentHash: HASH,
        kind: 'furniture',
        name: 'Chair',
        mediaType: 'model/gltf-binary',
      }
      const result = await integrityOf(model, Uint8Array.of(1, 2, 3), oversize)
      expect(result).toEqual({ errors: [] })
    })
  })

  describe('for a texture entry without a usable image size', () => {
    const unusableImages = [
      ['no image', withoutImage(textureAsset())],
      ['a null image', { ...textureAsset(), image: null }],
      ['an image that is a string', { ...textureAsset(), image: 'x' }],
      ['an image without numeric sides', { ...textureAsset(), image: { width: '256' } }],
    ]

    it.each(unusableImages)('adds no texture error for %s', async (_label, asset) => {
      const result = await integrityOf(asset, rgbPng(TEXTURE_SIDE))
      expect(result).toEqual({ errors: [] })
    })

    it('leaves the pack review to report that the image is required', async () => {
      const asset = withoutImage(textureAsset())
      const cliDeps = {
        readManifest: vi.fn(async () => manifestOf(asset)),
        createReader: vi.fn(() => readerFor(asset, rgbPng(TEXTURE_SIDE))),
        writeReport: vi.fn(async () => {}),
        log: vi.fn(),
        error: vi.fn(),
      }
      const code = await runPackCli(['validate', 'packs/grass-pack-1.0.0'], cliDeps)
      const messages = cliDeps.error.mock.calls.map(([message]) => message)
      expect(code).toBe(1)
      expect(messages).toContain('  - assets[0].image is required')
    })
  })
})
