// core/assets/image-bytes-test-support.ts
const BYTE_MASK = 0xff
const BITS_PER_BYTE = 8
const BITS_PER_TWO_BYTES = 16
const BITS_PER_THREE_BYTES = 24
const LOSSLESS_HEIGHT_SHIFT = 14

// The eight PNG signature bytes (0x89 'PNG' CR LF 0x1a LF), spelled in base64.
export const PNG_SIGNATURE = [...atob('iVBORw0KGgo=')].map((character) => character.charCodeAt(0))
export const ANY_CRC = [0, 0, 0, 0]
export const LOSSLESS_SIGNATURE = 0x2f
export const ANIMATION_FLAG = 0x02
export const COLOR_PROFILE_FLAG = 0x20
export const WEBP_FILE: [string, string] = ['RIFF', 'WEBP']

const CHUNK_HEADER_LENGTH = 8

export function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0))
}

export function uint32BigEndian(value: number): number[] {
  return [
    (value >>> BITS_PER_THREE_BYTES) & BYTE_MASK,
    (value >>> BITS_PER_TWO_BYTES) & BYTE_MASK,
    (value >>> BITS_PER_BYTE) & BYTE_MASK,
    value & BYTE_MASK,
  ]
}

export function uint24LittleEndian(value: number): number[] {
  return [
    value & BYTE_MASK,
    (value >>> BITS_PER_BYTE) & BYTE_MASK,
    (value >>> BITS_PER_TWO_BYTES) & BYTE_MASK,
  ]
}

export function uint32LittleEndian(value: number): number[] {
  return [...uint24LittleEndian(value), (value >>> BITS_PER_THREE_BYTES) & BYTE_MASK]
}

export function riffContainer(
  [riffTag, formType]: [string, string],
  chunkType: string,
  payload: number[],
): Uint8Array {
  return Uint8Array.from([
    ...ascii(riffTag),
    ...uint32LittleEndian(ascii(formType).length + CHUNK_HEADER_LENGTH + payload.length),
    ...ascii(formType),
    ...ascii(chunkType),
    ...uint32LittleEndian(payload.length),
    ...payload,
  ])
}

export function losslessWebp(width: number, height: number, extraBits = 0): Uint8Array {
  const packedSize = (width - 1) | ((height - 1) << LOSSLESS_HEIGHT_SHIFT) | extraBits
  return riffContainer(WEBP_FILE, 'VP8L', [LOSSLESS_SIGNATURE, ...uint32LittleEndian(packedSize)])
}

export function extendedWebp(width: number, height: number, flags: number): Uint8Array {
  return riffContainer(WEBP_FILE, 'VP8X', [
    flags,
    0,
    0,
    0,
    ...uint24LittleEndian(width - 1),
    ...uint24LittleEndian(height - 1),
  ])
}
