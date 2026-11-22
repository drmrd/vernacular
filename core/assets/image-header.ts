export interface ImageHeader {
  readonly mediaType: 'image/png'
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly colorType: number
  readonly interlaced: boolean
}

type ImageHeaderReader = (bytes: Uint8Array) => ImageHeader | undefined

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n'
const PNG_IHDR_TYPE = 'IHDR'

const UINT32_BYTES = 4
const PNG_CHUNK_LENGTH_BYTES = 4
const PNG_COMPRESSION_AND_FILTER_BYTES = 2
const PNG_IHDR_TYPE_OFFSET = PNG_SIGNATURE.length + PNG_CHUNK_LENGTH_BYTES
const PNG_WIDTH_OFFSET = PNG_IHDR_TYPE_OFFSET + PNG_IHDR_TYPE.length
const PNG_HEIGHT_OFFSET = PNG_WIDTH_OFFSET + UINT32_BYTES
const PNG_BIT_DEPTH_OFFSET = PNG_HEIGHT_OFFSET + UINT32_BYTES
const PNG_COLOR_TYPE_OFFSET = PNG_BIT_DEPTH_OFFSET + 1
const PNG_INTERLACE_OFFSET = PNG_COLOR_TYPE_OFFSET + 1 + PNG_COMPRESSION_AND_FILTER_BYTES
const PNG_BYTES_THROUGH_INTERLACE = PNG_INTERLACE_OFFSET + 1
const PNG_INTERLACE_ADAM7 = 1

function hasTextAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  return Array.from(expected).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  )
}

function readPngHeader(bytes: Uint8Array): ImageHeader | undefined {
  if (
    bytes.length < PNG_BYTES_THROUGH_INTERLACE ||
    !hasTextAt(bytes, 0, PNG_SIGNATURE) ||
    !hasTextAt(bytes, PNG_IHDR_TYPE_OFFSET, PNG_IHDR_TYPE)
  ) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    mediaType: 'image/png',
    width: view.getUint32(PNG_WIDTH_OFFSET),
    height: view.getUint32(PNG_HEIGHT_OFFSET),
    bitDepth: bytes[PNG_BIT_DEPTH_OFFSET] as number,
    colorType: bytes[PNG_COLOR_TYPE_OFFSET] as number,
    interlaced: bytes[PNG_INTERLACE_OFFSET] === PNG_INTERLACE_ADAM7,
  }
}

const IMAGE_HEADER_READERS: readonly ImageHeaderReader[] = [readPngHeader]

export function readImageHeader(bytes: Uint8Array): ImageHeader | undefined {
  for (const read of IMAGE_HEADER_READERS) {
    const header = read(bytes)
    if (header !== undefined) {
      return header
    }
  }
  return undefined
}
