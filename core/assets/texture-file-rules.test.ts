import { describe, expect, it } from 'vitest'
import { textureFileProblems, textureFileSizeProblems } from './texture-file-rules.ts'
import { TEXTURE_LIMITS } from './texture-asset-rules.ts'
import {
  ANIMATION_FLAG,
  ANY_CRC,
  COLOR_PROFILE_FLAG,
  PNG_SIGNATURE,
  ascii,
  extendedWebp,
  losslessWebp,
  uint32BigEndian,
} from './image-bytes-test-support.ts'

const IEND_CHUNK = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, ...ANY_CRC]
const COLOR_TYPE_RGB = 2
const COLOR_TYPE_RGBA = 6
const SIDE = 256
const OTHER_SIDE = 128
const WIDE = 512
const ANIMATION_CONTROL_OFFSET = PNG_SIGNATURE.length + 25
const ANIMATION_FRAME_COUNT = 2
const ENDLESS_PLAY_COUNT = 0

function pngChunk(type: string, data: number[]): number[] {
  return [...uint32BigEndian(data.length), ...ascii(type), ...data, ...ANY_CRC]
}

// The header readers do not check CRCs, so the fixtures leave them zero.
function png([width, height]: [number, number], colorType: number, extraChunks: string[] = []) {
  const ihdr = [...uint32BigEndian(width), ...uint32BigEndian(height), 8, colorType, 0, 0, 0]
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', ihdr),
    ...extraChunks.flatMap((type) => pngChunk(type, [0, 0, 0, 0])),
    ...IEND_CHUNK,
  ])
}

/** The PNG with an animation control chunk inserted straight after its header chunk. */
function animatedPng(still: Uint8Array): Uint8Array {
  const animationControl = pngChunk('acTL', [
    ...uint32BigEndian(ANIMATION_FRAME_COUNT),
    ...uint32BigEndian(ENDLESS_PLAY_COUNT),
  ])
  return Uint8Array.from([
    ...still.subarray(0, ANIMATION_CONTROL_OFFSET),
    ...animationControl,
    ...still.subarray(ANIMATION_CONTROL_OFFSET),
  ])
}

const pngAsset = { mediaType: 'image/png', image: { width: SIDE, height: SIDE } }
const webpAsset = { mediaType: 'image/webp', image: { width: SIDE, height: SIDE } }

describe('textureFileProblems for a PNG', () => {
  it('accepts an RGB PNG that matches its entry', () => {
    expect(textureFileProblems(pngAsset, png([SIDE, SIDE], COLOR_TYPE_RGB))).toEqual([])
  })

  it('accepts an RGBA PNG that matches its entry', () => {
    expect(textureFileProblems(pngAsset, png([SIDE, SIDE], COLOR_TYPE_RGBA))).toEqual([])
  })

  it('accepts a non-square PNG that matches its declared size', () => {
    const asset = { mediaType: 'image/png', image: { width: WIDE, height: SIDE } }
    expect(textureFileProblems(asset, png([WIDE, SIDE], COLOR_TYPE_RGB))).toEqual([])
  })

  it.each(['gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP'])('refuses a PNG with a %s chunk', (chunk) => {
    expect(textureFileProblems(pngAsset, png([SIDE, SIDE], COLOR_TYPE_RGB, [chunk]))).toEqual([
      `PNG carries the refused color chunk ${chunk}`,
    ])
  })

  it('refuses an animated PNG', () => {
    const bytes = animatedPng(png([SIDE, SIDE], COLOR_TYPE_RGB))
    expect(textureFileProblems(pngAsset, bytes)).toEqual(['PNG is animated'])
  })

  it('reports a width that differs from the declared width', () => {
    expect(textureFileProblems(pngAsset, png([OTHER_SIDE, SIDE], COLOR_TYPE_RGB))).toEqual([
      'image size 128 by 256 pixels differs from the declared 256 by 256',
    ])
  })

  it('reports a height that differs from the declared height', () => {
    expect(textureFileProblems(pngAsset, png([SIDE, OTHER_SIDE], COLOR_TYPE_RGB))).toEqual([
      'image size 256 by 128 pixels differs from the declared 256 by 256',
    ])
  })

  it.each([
    ['only a width', { width: SIDE }],
    ['only a height', { height: SIDE }],
    ['an array of sizes', [SIDE, SIDE]],
  ])('skips the size check when the entry declares %s', (_label, image) => {
    const asset = { mediaType: 'image/png', image }
    expect(textureFileProblems(asset, png([SIDE, SIDE], COLOR_TYPE_RGB))).toEqual([])
  })

  it('compares against a declared size of zero by zero', () => {
    const asset = { mediaType: 'image/png', image: { width: 0, height: 0 } }
    expect(textureFileProblems(asset, png([SIDE, SIDE], COLOR_TYPE_RGB))).toEqual([
      'image size 256 by 256 pixels differs from the declared 0 by 0',
    ])
  })
})

describe('textureFileProblems for a WebP', () => {
  it('accepts a lossless WebP that matches its entry', () => {
    expect(textureFileProblems(webpAsset, losslessWebp(SIDE, SIDE))).toEqual([])
  })

  it('refuses a WebP with a color profile', () => {
    expect(textureFileProblems(webpAsset, extendedWebp(SIDE, SIDE, COLOR_PROFILE_FLAG))).toEqual([
      'WebP carries a color profile',
    ])
  })

  it('refuses an animated WebP', () => {
    expect(textureFileProblems(webpAsset, extendedWebp(SIDE, SIDE, ANIMATION_FLAG))).toEqual([
      'WebP is animated',
    ])
  })
})

describe('textureFileProblems for bytes that are not the declared image', () => {
  const mismatch = (mediaType: string) => [
    `file bytes do not match the declared media type ${mediaType}`,
  ]

  it('reports garbage bytes', () => {
    const garbage = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(textureFileProblems(pngAsset, garbage)).toEqual(mismatch('image/png'))
  })

  it('reports a truncated PNG header', () => {
    const truncated = png([SIDE, SIDE], COLOR_TYPE_RGB).subarray(0, 20)
    expect(textureFileProblems(pngAsset, truncated)).toEqual(mismatch('image/png'))
  })

  it('reports PNG bytes for an image/webp asset', () => {
    expect(textureFileProblems(webpAsset, png([SIDE, SIDE], COLOR_TYPE_RGB))).toEqual(
      mismatch('image/webp'),
    )
  })
})

describe('textureFileProblems for an entry without a media type', () => {
  it('reports bytes that are not an image instead of throwing', () => {
    const asset = { mediaType: undefined, image: { width: SIDE, height: SIDE } }
    const notAnImage = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(textureFileProblems(asset as never, notAnImage)).toEqual([
      'file bytes do not match the declared media type undefined',
    ])
  })
})

describe('the texture file size limit', () => {
  const EIGHT_MIB = 8_388_608

  it('is 8 MiB', () => {
    expect(TEXTURE_LIMITS.maxFileBytes).toBe(EIGHT_MIB)
  })

  it.each([0, 1234, EIGHT_MIB - 1, EIGHT_MIB])('accepts a file of %i bytes', (fileSize) => {
    expect(textureFileSizeProblems(fileSize)).toEqual([])
  })

  it('reports a file one byte above the limit, naming its size and the limit', () => {
    expect(textureFileSizeProblems(EIGHT_MIB + 1)).toEqual([
      'file is 8388609 bytes, above the 8 MiB (8388608 byte) limit for a texture',
    ])
  })
})
