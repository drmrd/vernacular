import { describe, expect, it } from 'vitest'
import { readImageHeader } from './image-header.ts'

const LOSSY_START_CODE = [0x9d, 0x01, 0x2a]
const ANY_FRAME_TAG = [0x10, 0x02, 0x00]
const LOSSLESS_SIGNATURE = 0x2f
const ANIMATION_FLAG = 0x02
const EXIF_FLAG = 0x08
const ALPHA_FLAG = 0x10
const COLOR_PROFILE_FLAG = 0x20
const LOSSLESS_ALPHA_BIT = 1 << 28
const WIDTH_SCALE_BITS = 0xc000
const HEIGHT_SCALE_BITS = 0x4000
const WEBP_FILE: [string, string] = ['RIFF', 'WEBP']
const START_CODE_OFFSET = 23
const LOSSLESS_SIGNATURE_OFFSET = 20

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0))
}

function uint16LittleEndian(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function uint24LittleEndian(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]
}

function uint32LittleEndian(value: number): number[] {
  return [...uint24LittleEndian(value), (value >>> 24) & 0xff]
}

function riffContainer(
  [riffTag, formType]: [string, string],
  chunkType: string,
  payload: number[],
): Uint8Array {
  const chunkHeaderLength = 8
  return Uint8Array.from([
    ...ascii(riffTag),
    ...uint32LittleEndian(ascii(formType).length + chunkHeaderLength + payload.length),
    ...ascii(formType),
    ...ascii(chunkType),
    ...uint32LittleEndian(payload.length),
    ...payload,
  ])
}

function lossyPayload(width: number, height: number, scaleBits = { width: 0, height: 0 }) {
  return [
    ...ANY_FRAME_TAG,
    ...LOSSY_START_CODE,
    ...uint16LittleEndian(width | scaleBits.width),
    ...uint16LittleEndian(height | scaleBits.height),
  ]
}

function lossyWebp(width: number, height: number, scaleBits?: { width: number; height: number }) {
  return riffContainer(WEBP_FILE, 'VP8 ', lossyPayload(width, height, scaleBits))
}

function losslessWebp(width: number, height: number, extraBits = 0): Uint8Array {
  const packedSize = (width - 1) | ((height - 1) << 14) | extraBits
  return riffContainer(WEBP_FILE, 'VP8L', [LOSSLESS_SIGNATURE, ...uint32LittleEndian(packedSize)])
}

function extendedWebp(width: number, height: number, flags: number): Uint8Array {
  return riffContainer(WEBP_FILE, 'VP8X', [
    flags,
    0,
    0,
    0,
    ...uint24LittleEndian(width - 1),
    ...uint24LittleEndian(height - 1),
  ])
}

function webpHeader(
  width: number,
  height: number,
  flags = { animated: false, colorProfile: false },
) {
  return { mediaType: 'image/webp', width, height, ...flags }
}

describe('readImageHeader for WebP', () => {
  it('reads the size of a lossy WebP and reports no animation or color profile', () => {
    expect(readImageHeader(lossyWebp(2048, 1024))).toEqual(webpHeader(2048, 1024))
  })

  it('reads a lossy WebP size from the low 14 bits and ignores the scale bits', () => {
    const bytes = lossyWebp(300, 200, { width: WIDTH_SCALE_BITS, height: HEIGHT_SCALE_BITS })

    expect(readImageHeader(bytes)).toEqual(webpHeader(300, 200))
  })

  it.each([
    [2048, 1024],
    [300, 200],
    [16384, 513],
  ])('reads the size of a %i by %i lossless WebP', (width, height) => {
    expect(readImageHeader(losslessWebp(width, height))).toEqual(webpHeader(width, height))
  })

  it('reads the same lossless WebP size when the alpha bit is set', () => {
    const bytes = losslessWebp(300, 200, LOSSLESS_ALPHA_BIT)

    expect(readImageHeader(bytes)).toEqual(webpHeader(300, 200))
  })

  it('reads an extended WebP size that needs all three bytes of each dimension', () => {
    expect(readImageHeader(extendedWebp(70000, 300000, 0))).toEqual(webpHeader(70000, 300000))
  })
})

describe('readImageHeader for WebP extended flags', () => {
  it.each([
    ['neither flag', 0, { animated: false, colorProfile: false }],
    ['animation only', ANIMATION_FLAG, { animated: true, colorProfile: false }],
    ['a color profile only', COLOR_PROFILE_FLAG, { animated: false, colorProfile: true }],
    ['alpha and EXIF only', ALPHA_FLAG | EXIF_FLAG, { animated: false, colorProfile: false }],
    ['both flags', ANIMATION_FLAG | COLOR_PROFILE_FLAG, { animated: true, colorProfile: true }],
  ])('reads an extended WebP with %s', (_label, flagByte, expectedFlags) => {
    const bytes = extendedWebp(2048, 1024, flagByte)

    expect(readImageHeader(bytes)).toEqual(webpHeader(2048, 1024, expectedFlags))
  })
})

describe('readImageHeader for WebP input length', () => {
  const chunkCases = [
    ['VP8 ', () => lossyWebp(2048, 1024), 30],
    ['VP8L', () => losslessWebp(2048, 1024), 25],
    ['VP8X', () => extendedWebp(2048, 1024, 0), 30],
  ] as const

  it.each(chunkCases)('reads a %s header that is exactly long enough', (_type, build, length) => {
    expect(readImageHeader(build().slice(0, length))).toMatchObject({ width: 2048, height: 1024 })
  })

  it.each(chunkCases)('gives undefined for a %s header one byte short', (_type, build, length) => {
    expect(readImageHeader(build().slice(0, length - 1))).toBeUndefined()
  })

  it.each(chunkCases)('gives undefined for a %s header cut short', (_type, build) => {
    expect(readImageHeader(build().slice(0, 21))).toBeUndefined()
  })
})

describe('readImageHeader for WebP rejection and views', () => {
  it('gives undefined for a RIFF file whose form type is not WEBP', () => {
    const bytes = riffContainer(['RIFF', 'WAVE'], 'VP8 ', lossyPayload(2048, 1024))

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the container tag is RIFX instead of RIFF', () => {
    const bytes = riffContainer(['RIFX', 'WEBP'], 'VP8 ', lossyPayload(2048, 1024))

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined for an unknown chunk type under a valid WebP container', () => {
    const bytes = riffContainer(WEBP_FILE, 'VP8Y', lossyPayload(2048, 1024))

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the lossy start code is broken', () => {
    const bytes = lossyWebp(2048, 1024)
    bytes[START_CODE_OFFSET] = 0x00

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the lossless signature is broken', () => {
    const bytes = losslessWebp(2048, 1024)
    bytes[LOSSLESS_SIGNATURE_OFFSET] = 0x00

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it.each([
    ['lossless', losslessWebp(300, 200), webpHeader(300, 200)],
    [
      'extended',
      extendedWebp(300, 200, ANIMATION_FLAG),
      webpHeader(300, 200, { animated: true, colorProfile: false }),
    ],
  ])(
    'reads a %s WebP header through a view that starts partway into a buffer',
    (_kind, webp, expected) => {
      const padding = [1, 2, 3, 4, 5]
      const buffer = Uint8Array.from([...padding, ...webp])

      expect(readImageHeader(buffer.subarray(padding.length))).toEqual(expected)
    },
  )
})
