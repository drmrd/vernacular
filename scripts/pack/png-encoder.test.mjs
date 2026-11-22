import { crc32, inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodePng } from './png-encoder.mjs'

const SIDE = 64
const BYTES_PER_PIXEL = 3
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const COLOR_TYPE_RGB = 2

function patternPixels() {
  const pixels = new Uint8Array(SIDE * SIDE * BYTES_PER_PIXEL)
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 7 + 3) % 256
  }
  return pixels
}

function readChunks(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks = []
  let offset = SIGNATURE.length
  while (offset < png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const data = png.subarray(offset + 8, offset + 8 + length)
    const crc = view.getUint32(offset + 8 + length)
    const crcInput = png.subarray(offset + 4, offset + 8 + length)
    chunks.push({ type, data, crc, expectedCrc: crc32(crcInput) })
    offset += 12 + length
  }
  return chunks
}

describe('encodePng', () => {
  it('encodes 8-bit RGB pixels as a valid PNG of three chunks whose inflated rows are the pixels', () => {
    const pixels = patternPixels()
    const png = encodePng({ width: SIDE, height: SIDE, pixels })

    expect([...png.subarray(0, SIGNATURE.length)]).toEqual(SIGNATURE)
    const chunks = readChunks(png)
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    for (const chunk of chunks) {
      expect(chunk.crc).toBe(chunk.expectedCrc)
    }

    const header = new DataView(
      chunks[0].data.buffer,
      chunks[0].data.byteOffset,
      chunks[0].data.byteLength,
    )
    expect(header.getUint32(0)).toBe(SIDE)
    expect(header.getUint32(4)).toBe(SIDE)
    expect(header.getUint8(8)).toBe(8)
    expect(header.getUint8(9)).toBe(COLOR_TYPE_RGB)
    expect(header.getUint8(12)).toBe(0)

    const rows = inflateSync(chunks[1].data)
    const rowBytes = SIDE * BYTES_PER_PIXEL
    expect(rows.length).toBe(SIDE * (rowBytes + 1))
    for (let row = 0; row < SIDE; row += 1) {
      const start = row * (rowBytes + 1)
      expect(rows[start]).toBe(0)
      expect([...rows.subarray(start + 1, start + 1 + rowBytes)]).toEqual([
        ...pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
      ])
    }

    expect(encodePng({ width: SIDE, height: SIDE, pixels })).toEqual(png)
  })

  it('splits rows larger than one stored deflate block across several blocks', () => {
    const side = 160
    const rowBytes = side * BYTES_PER_PIXEL
    const pixels = new Uint8Array(side * rowBytes)
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 7 + 3) % 256
    }
    const png = encodePng({ width: side, height: side, pixels })
    const idat = readChunks(png).find((chunk) => chunk.type === 'IDAT').data

    const rows = inflateSync(idat)
    expect(rows.length).toBe(side * (rowBytes + 1))
    for (let row = 0; row < side; row += 1) {
      const start = row * (rowBytes + 1)
      expect(rows[start]).toBe(0)
      expect([...rows.subarray(start + 1, start + 1 + rowBytes)]).toEqual([
        ...pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
      ])
    }

    const zlibHeaderBytes = 2
    const adlerBytes = 4
    const blockHeaderBytes = 5
    const maxStoredLength = 65535
    const view = new DataView(idat.buffer, idat.byteOffset, idat.byteLength)
    const blocks = []
    let offset = zlibHeaderBytes
    while (offset < idat.length - adlerBytes) {
      const length = view.getUint16(offset + 1, true)
      const complement = view.getUint16(offset + 3, true)
      blocks.push({ final: idat[offset] & 1, type: (idat[offset] >> 1) & 3, length, complement })
      offset += blockHeaderBytes + length
    }

    expect(offset).toBe(idat.length - adlerBytes)
    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) {
      expect(block.type).toBe(0)
      expect(block.length).toBeLessThanOrEqual(maxStoredLength)
      expect(block.complement).toBe(~block.length & 0xffff)
    }
    expect(blocks.map((block) => block.final)).toEqual([...blocks.slice(1).map(() => 0), 1])
  })
})
