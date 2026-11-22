import { describe, expect, it } from 'vitest'
import { readImageHeader } from './image-header.ts'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR_DATA_LENGTH = 13
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52]
const ANY_CRC = [0, 0, 0, 0]

interface HeaderFields {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

function uint32BigEndian(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function pngFirst33Bytes(fields: HeaderFields): Uint8Array {
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...uint32BigEndian(IHDR_DATA_LENGTH),
    ...IHDR_TYPE,
    ...uint32BigEndian(fields.width),
    ...uint32BigEndian(fields.height),
    fields.bitDepth,
    fields.colorType,
    0,
    0,
    fields.interlace,
    ...ANY_CRC,
  ])
}

const rgbImage: HeaderFields = {
  width: 256,
  height: 128,
  bitDepth: 8,
  colorType: 2,
  interlace: 0,
}

describe('readImageHeader', () => {
  it('reads the size, bit depth, texel layout, and interlace of a PNG from its first 33 bytes', () => {
    const bytes = pngFirst33Bytes(rgbImage)

    expect(bytes).toHaveLength(33)
    expect(readImageHeader(bytes)).toEqual({
      mediaType: 'image/png',
      width: 256,
      height: 128,
      bitDepth: 8,
      colorType: 2,
      interlaced: false,
    })
  })

  it('reports an interlaced PNG as interlaced', () => {
    const header = readImageHeader(pngFirst33Bytes({ ...rgbImage, interlace: 1 }))

    expect(header).toEqual({
      mediaType: 'image/png',
      width: 256,
      height: 128,
      bitDepth: 8,
      colorType: 2,
      interlaced: true,
    })
  })

  it('gives undefined when the PNG signature is broken', () => {
    const bytes = pngFirst33Bytes(rgbImage)
    bytes[1] = 0x51

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the header is cut short', () => {
    const bytes = pngFirst33Bytes(rgbImage).slice(0, 20)

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the header ends just before the interlace byte', () => {
    const bytes = pngFirst33Bytes(rgbImage).slice(0, 28)

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('gives undefined when the first chunk is not IHDR', () => {
    const bytes = pngFirst33Bytes(rgbImage)
    bytes[12] = 0x58

    expect(readImageHeader(bytes)).toBeUndefined()
  })

  it('reads the header through a view that starts partway into a larger buffer', () => {
    const padding = [1, 2, 3, 4, 5]
    const buffer = Uint8Array.from([...padding, ...pngFirst33Bytes(rgbImage)])

    expect(readImageHeader(buffer.subarray(padding.length))).toEqual({
      mediaType: 'image/png',
      width: 256,
      height: 128,
      bitDepth: 8,
      colorType: 2,
      interlaced: false,
    })
  })
})

const LOSSY_START_CODE = [0x9d, 0x01, 0x2a]
const ANY_FRAME_TAG = [0x10, 0x02, 0x00]
const LOSSLESS_SIGNATURE = 0x2f
const ANIMATION_FLAG = 0x02
const COLOR_PROFILE_FLAG = 0x20
const WIDTH_SCALE_BITS = 0xc000
const HEIGHT_SCALE_BITS = 0x4000

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

function riffContainer(formType: string, chunkType: string, payload: number[]): Uint8Array {
  const chunkHeaderLength = 8
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...uint32LittleEndian(ascii(formType).length + chunkHeaderLength + payload.length),
    ...ascii(formType),
    ...ascii(chunkType),
    ...uint32LittleEndian(payload.length),
    ...payload,
  ])
}

function lossyWebp(width: number, height: number, scaleBits = { width: 0, height: 0 }): Uint8Array {
  return riffContainer('WEBP', 'VP8 ', [
    ...ANY_FRAME_TAG,
    ...LOSSY_START_CODE,
    ...uint16LittleEndian(width | scaleBits.width),
    ...uint16LittleEndian(height | scaleBits.height),
  ])
}

function losslessWebp(width: number, height: number): Uint8Array {
  const packedSize = (width - 1) | ((height - 1) << 14)
  return riffContainer('WEBP', 'VP8L', [LOSSLESS_SIGNATURE, ...uint32LittleEndian(packedSize)])
}

function extendedWebp(width: number, height: number, flags: number): Uint8Array {
  return riffContainer('WEBP', 'VP8X', [
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

  it.each([
    ['neither flag', 0, { animated: false, colorProfile: false }],
    ['animation only', ANIMATION_FLAG, { animated: true, colorProfile: false }],
    ['a color profile only', COLOR_PROFILE_FLAG, { animated: false, colorProfile: true }],
  ])('reads an extended WebP with %s', (_label, flagByte, expectedFlags) => {
    const bytes = extendedWebp(2048, 1024, flagByte)

    expect(readImageHeader(bytes)).toEqual(webpHeader(2048, 1024, expectedFlags))
  })

  it('reads an extended WebP size that needs all three bytes of each dimension', () => {
    expect(readImageHeader(extendedWebp(70000, 300000, 0))).toEqual(webpHeader(70000, 300000))
  })

  it('gives undefined for a RIFF file whose form type is not WEBP', () => {
    const bytes = riffContainer('WAVE', 'VP8 ', [
      ...ANY_FRAME_TAG,
      ...LOSSY_START_CODE,
      ...uint16LittleEndian(2048),
      ...uint16LittleEndian(1024),
    ])

    expect(readImageHeader(bytes)).toBeUndefined()
  })
})
