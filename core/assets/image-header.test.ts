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

  it('gives undefined when fewer than 33 bytes are given', () => {
    const bytes = pngFirst33Bytes(rgbImage).slice(0, 20)

    expect(readImageHeader(bytes)).toBeUndefined()
  })
})
