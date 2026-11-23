import { encodePng } from './png-encoder.mjs'

/**
 * Byte builders for pack texture tests: valid RGB PNGs and lossy or animated
 * WebPs whose headers carry a chosen size. They build only what the header
 * checks read; the image payloads are not decodable.
 */

export const TEXTURE_SIDE = 256

const RGB_BYTES_PER_PIXEL = 3
const GREY = 0x80

const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]
const VP8X = [0x56, 0x50, 0x38, 0x58]
const VP8_LOSSY = [0x56, 0x50, 0x38, 0x20]
const LOSSY_START_CODE = [0x9d, 0x01, 0x2a]
const ANY_FRAME_TAG = [0x10, 0x02, 0x00]
const ANIMATION_FLAG = 0x02
const UINT32_BYTES = 4
const CHUNK_HEADER_BYTES = 8
const BYTE_MASK = 0xff
const BITS_PER_BYTE = 8
const UINT16_BYTES = 2
const UINT24_BYTES = 3

function littleEndian(value, byteCount) {
  return Array.from(
    { length: byteCount },
    (_, index) => (value >>> (index * BITS_PER_BYTE)) & BYTE_MASK,
  )
}

function riffWebp(chunkType, payload) {
  const chunkBytes = CHUNK_HEADER_BYTES + payload.length
  return Uint8Array.from([
    ...RIFF,
    ...littleEndian(UINT32_BYTES + chunkBytes, UINT32_BYTES),
    ...WEBP,
    ...chunkType,
    ...littleEndian(payload.length, UINT32_BYTES),
    ...payload,
  ])
}

export function lossyWebp(width, height) {
  const payload = [
    ...ANY_FRAME_TAG,
    ...LOSSY_START_CODE,
    ...littleEndian(width, UINT16_BYTES),
    ...littleEndian(height, UINT16_BYTES),
  ]
  return riffWebp(VP8_LOSSY, payload)
}

export function animatedWebp(width, height) {
  const reservedBytes = [0, 0, 0]
  const payload = [
    ANIMATION_FLAG,
    ...reservedBytes,
    ...littleEndian(width - 1, UINT24_BYTES),
    ...littleEndian(height - 1, UINT24_BYTES),
  ]
  return riffWebp(VP8X, payload)
}

export function rgbPng(side) {
  const pixels = new Uint8Array(side * side * RGB_BYTES_PER_PIXEL).fill(GREY)
  return encodePng({ width: side, height: side, pixels })
}

/** The twelve-byte RIFF/WEBP signature that a thumbnail needs to pass the signature check. */
export function thumbnailSignature() {
  return Uint8Array.from([...RIFF, 1, 0, 0, 0, ...WEBP])
}
