import { crc32 } from 'node:zlib'

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const MAX_STORED_BLOCK_BYTES = 65535
const BYTES_PER_PIXEL = 3
const BIT_DEPTH = 8
const COLOR_TYPE_RGB = 2
const ADLER_MODULUS = 65521
const ADLER_HIGH_WORD_SHIFT = 16
const ZLIB_HEADER = Uint8Array.of(0x78, 0x01)
const CHUNK_LENGTH_BYTES = 4
const CHUNK_TYPE_BYTES = 4
const CHUNK_CRC_BYTES = 4
const STORED_BLOCK_HEADER_BYTES = 5
const STORED_BLOCK_LENGTH_OFFSET = 1
const STORED_BLOCK_COMPLEMENT_OFFSET = 3
const ADLER_TRAILER_BYTES = 4
const IHDR_BYTES = 13
const IHDR_HEIGHT_OFFSET = 4
const IHDR_BIT_DEPTH_OFFSET = 8
const IHDR_COLOR_TYPE_OFFSET = 9

/**
 * Encodes 8-bit RGB pixels as a deterministic PNG with no compression.
 * @param {{ width: number, height: number, pixels: Uint8Array }} image pixels are row-major RGB triples
 * @returns {Uint8Array}
 */
export function encodePng({ width, height, pixels }) {
  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', headerData(width, height)),
    buildChunk('IDAT', zlibStore(filteredScanlines({ width, height, pixels }))),
    buildChunk('IEND', new Uint8Array(0)),
  ])
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
function headerData(width, height) {
  const header = new Uint8Array(IHDR_BYTES)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(IHDR_HEIGHT_OFFSET, height)
  header[IHDR_BIT_DEPTH_OFFSET] = BIT_DEPTH
  header[IHDR_COLOR_TYPE_OFFSET] = COLOR_TYPE_RGB
  return header
}

/**
 * Prefixes every row with filter type 0 (none).
 * @param {{ width: number, height: number, pixels: Uint8Array }} image
 * @returns {Uint8Array}
 */
function filteredScanlines({ width, height, pixels }) {
  const rowBytes = width * BYTES_PER_PIXEL
  const raw = new Uint8Array(height * (rowBytes + 1))
  for (let row = 0; row < height; row += 1) {
    raw.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
  }
  return raw
}

/**
 * Chunk layout: length, type, data, CRC computed over type and data.
 * @param {string} type
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function buildChunk(type, data) {
  const dataOffset = CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES
  const crcOffset = dataOffset + data.length
  const chunk = new Uint8Array(crcOffset + CHUNK_CRC_BYTES)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode(type), CHUNK_LENGTH_BYTES)
  chunk.set(data, dataOffset)
  view.setUint32(crcOffset, crc32(chunk.subarray(CHUNK_LENGTH_BYTES, crcOffset)))
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
  return ((high << ADLER_HIGH_WORD_SHIFT) | low) >>> 0
}

/**
 * Wraps bytes in a zlib stream made only of stored (uncompressed) deflate blocks.
 * @param {Uint8Array} raw
 * @returns {Uint8Array}
 */
function zlibStore(raw) {
  const blockCount = Math.max(1, Math.ceil(raw.length / MAX_STORED_BLOCK_BYTES))
  const out = new Uint8Array(
    ZLIB_HEADER.length + raw.length + blockCount * STORED_BLOCK_HEADER_BYTES + ADLER_TRAILER_BYTES,
  )
  const view = new DataView(out.buffer)
  out.set(ZLIB_HEADER)
  let cursor = ZLIB_HEADER.length
  for (let block = 0; block < blockCount; block += 1) {
    const slice = raw.subarray(block * MAX_STORED_BLOCK_BYTES, (block + 1) * MAX_STORED_BLOCK_BYTES)
    view.setUint8(cursor, block === blockCount - 1 ? 1 : 0)
    view.setUint16(cursor + STORED_BLOCK_LENGTH_OFFSET, slice.length, true)
    view.setUint16(cursor + STORED_BLOCK_COMPLEMENT_OFFSET, ~slice.length & 0xffff, true)
    out.set(slice, cursor + STORED_BLOCK_HEADER_BYTES)
    cursor += STORED_BLOCK_HEADER_BYTES + slice.length
  }
  view.setUint32(cursor, adler32(raw))
  return out
}
