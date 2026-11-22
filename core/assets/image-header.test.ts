import { describe, expect, it } from 'vitest'
import { pngChunkTypes, readImageHeader } from './image-header.ts'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR_DATA_LENGTH = 13
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52]
const ANY_CRC = [0, 0, 0, 0]
const GAMA_TYPE = [0x67, 0x41, 0x4d, 0x41]
const IDAT_TYPE = [0x49, 0x44, 0x41, 0x54]
const IEND_TYPE = [0x49, 0x45, 0x4e, 0x44]
const IDAT_DATA = [0x78, 0x01, 0x01]
const GAMA_DATA = [0, 1, 0x86, 0xa0]

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

function chunk(type: number[], data: number[]): number[] {
  return [...uint32BigEndian(data.length), ...type, ...data, ...ANY_CRC]
}

describe('pngChunkTypes', () => {
  it('lists the chunk types of a PNG in order', () => {
    const withGamma = Uint8Array.from([
      ...pngFirst33Bytes(rgbImage),
      ...chunk(GAMA_TYPE, GAMA_DATA),
      ...chunk(IDAT_TYPE, IDAT_DATA),
      ...chunk(IEND_TYPE, []),
    ])

    expect(pngChunkTypes(withGamma)).toEqual(['IHDR', 'gAMA', 'IDAT', 'IEND'])
  })
})
