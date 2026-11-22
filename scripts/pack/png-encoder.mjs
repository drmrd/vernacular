import { crc32 } from 'node:zlib'

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const MAX_STORED_BLOCK_BYTES = 65535
const BYTES_PER_PIXEL = 3
const BIT_DEPTH = 8
const COLOR_TYPE_RGB = 2
const ADLER_MODULUS = 65521
const ZLIB_HEADER = Uint8Array.of(0x78, 0x01)
const IHDR_BYTES = 13

/**
 * Chunk layout: length, type, data, CRC computed over type and data.
 * @param {string} type
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function buildChunk(type, data) {
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode(type), 4)
  chunk.set(data, 8)
  view.setUint32(data.length + 8, crc32(chunk.subarray(4, data.length + 8)))
  return chunk
}

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function adler32(bytes) {
  let low = 1
  let high = 0
  for (const byte of bytes) {
    low = (low + byte) % ADLER_MODULUS
    high = (high + low) % ADLER_MODULUS
  }
  return ((high << 16) | low) >>> 0
}

/**
 * Wraps bytes in a zlib stream made only of stored (uncompressed) deflate blocks.
 * @param {Uint8Array} raw
 * @returns {Uint8Array}
 */
function zlibStore(raw) {
  const blockCount = Math.max(1, Math.ceil(raw.length / MAX_STORED_BLOCK_BYTES))
  const out = new Uint8Array(ZLIB_HEADER.length + raw.length + blockCount * 5 + 4)
  const view = new DataView(out.buffer)
  out.set(ZLIB_HEADER)
  let cursor = ZLIB_HEADER.length
  for (let block = 0; block < blockCount; block += 1) {
    const slice = raw.subarray(block * MAX_STORED_BLOCK_BYTES, (block + 1) * MAX_STORED_BLOCK_BYTES)
    view.setUint8(cursor, block === blockCount - 1 ? 1 : 0)
    view.setUint16(cursor + 1, slice.length, true)
    view.setUint16(cursor + 3, ~slice.length & 0xffff, true)
    out.set(slice, cursor + 5)
    cursor += 5 + slice.length
  }
  view.setUint32(cursor, adler32(raw))
  return out
}

/**
 * Encodes 8-bit RGB pixels as a deterministic PNG with no compression.
 * @param {{ width: number, height: number, pixels: Uint8Array }} image pixels are row-major RGB triples
 * @returns {Uint8Array}
 */
export function encodePng({ width, height, pixels }) {
  const rowBytes = width * BYTES_PER_PIXEL
  const raw = new Uint8Array(height * (rowBytes + 1))
  for (let row = 0; row < height; row += 1) {
    raw.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
  }
  const header = new Uint8Array(IHDR_BYTES)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, width)
  headerView.setUint32(4, height)
  header[8] = BIT_DEPTH
  header[9] = COLOR_TYPE_RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', header),
    buildChunk('IDAT', zlibStore(raw)),
    buildChunk('IEND', new Uint8Array(0)),
  ])
}
