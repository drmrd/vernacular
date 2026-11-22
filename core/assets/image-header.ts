export interface PngImageHeader {
  readonly mediaType: 'image/png'
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly colorType: number
  readonly interlaced: boolean
}

export interface WebpImageHeader {
  readonly mediaType: 'image/webp'
  readonly width: number
  readonly height: number
  readonly animated: boolean
  readonly colorProfile: boolean
}

export type ImageHeader = PngImageHeader | WebpImageHeader

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

function readPngHeader(bytes: Uint8Array): PngImageHeader | undefined {
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

const PNG_CHUNK_TYPE_BYTES = PNG_IHDR_TYPE.length
const PNG_CHUNK_CRC_BYTES = UINT32_BYTES
const PNG_CHUNK_HEADER_BYTES = PNG_CHUNK_LENGTH_BYTES + PNG_CHUNK_TYPE_BYTES

export function pngChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = []
  if (!hasTextAt(bytes, 0, PNG_SIGNATURE)) return types
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let chunkOffset = PNG_SIGNATURE.length
  while (chunkOffset + PNG_CHUNK_HEADER_BYTES <= bytes.byteLength) {
    const typeOffset = chunkOffset + PNG_CHUNK_LENGTH_BYTES
    const dataOffset = typeOffset + PNG_CHUNK_TYPE_BYTES
    const dataEnd = dataOffset + view.getUint32(chunkOffset)
    if (dataEnd <= bytes.byteLength) {
      types.push(String.fromCharCode(...bytes.subarray(typeOffset, dataOffset)))
    }
    chunkOffset = dataEnd + PNG_CHUNK_CRC_BYTES
  }
  return types
}

const WEBP_RIFF_TAG = 'RIFF'
const WEBP_FORM_TAG = 'WEBP'
const WEBP_FORM_OFFSET = 8
const WEBP_CHUNK_TYPE_OFFSET = 12
const WEBP_CHUNK_TYPE_LENGTH = 4
const WEBP_PAYLOAD_OFFSET = 20
const WEBP_LOSSY_START_CODE_FIRST = 0x9d
const WEBP_LOSSY_START_CODE_LAST = 0x2a
const WEBP_LOSSY_START_CODE = [WEBP_LOSSY_START_CODE_FIRST, 1, WEBP_LOSSY_START_CODE_LAST]
const WEBP_LOSSY_FRAME_TAG_BYTES = 3
const WEBP_LOSSY_START_CODE_OFFSET = WEBP_PAYLOAD_OFFSET + WEBP_LOSSY_FRAME_TAG_BYTES
const WEBP_LOSSY_WIDTH_OFFSET = WEBP_LOSSY_START_CODE_OFFSET + WEBP_LOSSY_START_CODE.length
const WEBP_LOSSY_HEIGHT_OFFSET = WEBP_LOSSY_WIDTH_OFFSET + 2
const WEBP_LOSSY_BYTES_THROUGH_HEIGHT = WEBP_LOSSY_HEIGHT_OFFSET + 2
const WEBP_LOSSLESS_SIGNATURE = 0x2f
const WEBP_LOSSLESS_PACKED_OFFSET = WEBP_PAYLOAD_OFFSET + 1
const WEBP_LOSSLESS_BYTES_THROUGH_PACKED = WEBP_LOSSLESS_PACKED_OFFSET + UINT32_BYTES
const WEBP_EXTENDED_FLAGS_AND_RESERVED_BYTES = 4
const WEBP_EXTENDED_WIDTH_OFFSET = WEBP_PAYLOAD_OFFSET + WEBP_EXTENDED_FLAGS_AND_RESERVED_BYTES
const WEBP_UINT24_BYTES = 3
const WEBP_EXTENDED_HEIGHT_OFFSET = WEBP_EXTENDED_WIDTH_OFFSET + WEBP_UINT24_BYTES
const WEBP_BYTES_THROUGH_EXTENDED_HEIGHT = WEBP_EXTENDED_HEIGHT_OFFSET + WEBP_UINT24_BYTES
const WEBP_EXTENDED_ANIMATION_FLAG = 0x02
const WEBP_EXTENDED_PROFILE_FLAG = 0x20
const WEBP_SIZE_BITS = 14
const WEBP_SIZE_MASK = (1 << WEBP_SIZE_BITS) - 1
const WEBP_CHUNK_TYPE_END = WEBP_CHUNK_TYPE_OFFSET + WEBP_CHUNK_TYPE_LENGTH
const BITS_PER_TWO_BYTES = 16

function webpHeader(width: number, height: number, flags = 0): WebpImageHeader {
  return {
    mediaType: 'image/webp',
    width,
    height,
    animated: (flags & WEBP_EXTENDED_ANIMATION_FLAG) !== 0,
    colorProfile: (flags & WEBP_EXTENDED_PROFILE_FLAG) !== 0,
  }
}

function readUint24(view: DataView, offset: number): number {
  return view.getUint16(offset, true) + (view.getUint8(offset + 2) << BITS_PER_TWO_BYTES)
}

function readLossyWebp(bytes: Uint8Array, view: DataView): WebpImageHeader | undefined {
  const hasStartCode = WEBP_LOSSY_START_CODE.every(
    (code, index) => bytes[WEBP_LOSSY_START_CODE_OFFSET + index] === code,
  )
  return hasStartCode
    ? webpHeader(
        view.getUint16(WEBP_LOSSY_WIDTH_OFFSET, true) & WEBP_SIZE_MASK,
        view.getUint16(WEBP_LOSSY_HEIGHT_OFFSET, true) & WEBP_SIZE_MASK,
      )
    : undefined
}

function readLosslessWebp(bytes: Uint8Array, view: DataView): WebpImageHeader | undefined {
  if (bytes[WEBP_PAYLOAD_OFFSET] !== WEBP_LOSSLESS_SIGNATURE) return undefined
  const packed = view.getUint32(WEBP_LOSSLESS_PACKED_OFFSET, true)
  return webpHeader(
    (packed & WEBP_SIZE_MASK) + 1,
    ((packed >>> WEBP_SIZE_BITS) & WEBP_SIZE_MASK) + 1,
  )
}

function readExtendedWebp(bytes: Uint8Array, view: DataView): WebpImageHeader {
  return webpHeader(
    readUint24(view, WEBP_EXTENDED_WIDTH_OFFSET) + 1,
    readUint24(view, WEBP_EXTENDED_HEIGHT_OFFSET) + 1,
    bytes[WEBP_PAYLOAD_OFFSET] as number,
  )
}

interface WebpChunkReader {
  readonly bytesNeeded: number
  readonly read: (bytes: Uint8Array, view: DataView) => WebpImageHeader | undefined
}

const WEBP_CHUNK_READERS = new Map<string, WebpChunkReader>([
  ['VP8 ', { bytesNeeded: WEBP_LOSSY_BYTES_THROUGH_HEIGHT, read: readLossyWebp }],
  ['VP8L', { bytesNeeded: WEBP_LOSSLESS_BYTES_THROUGH_PACKED, read: readLosslessWebp }],
  ['VP8X', { bytesNeeded: WEBP_BYTES_THROUGH_EXTENDED_HEIGHT, read: readExtendedWebp }],
])

function readWebpHeader(bytes: Uint8Array): WebpImageHeader | undefined {
  const isRiffWebp =
    hasTextAt(bytes, 0, WEBP_RIFF_TAG) && hasTextAt(bytes, WEBP_FORM_OFFSET, WEBP_FORM_TAG)
  const chunkType = String.fromCharCode(
    ...bytes.subarray(WEBP_CHUNK_TYPE_OFFSET, WEBP_CHUNK_TYPE_END),
  )
  const chunkReader = isRiffWebp ? WEBP_CHUNK_READERS.get(chunkType) : undefined
  if (chunkReader === undefined || bytes.length < chunkReader.bytesNeeded) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return chunkReader.read(bytes, view)
}

const IMAGE_HEADER_READERS: readonly ImageHeaderReader[] = [readPngHeader, readWebpHeader]

export function readImageHeader(bytes: Uint8Array): ImageHeader | undefined {
  for (const read of IMAGE_HEADER_READERS) {
    const header = read(bytes)
    if (header !== undefined) {
      return header
    }
  }
  return undefined
}
