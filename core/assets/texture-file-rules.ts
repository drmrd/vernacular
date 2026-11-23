// core/assets/texture-file-rules.ts
//
// Byte rules for a texture file (ADR-0219): the header must agree with the
// manifest entry, and the PNG or WebP must meet the format constraints. Pure:
// it reads the bytes and returns a list of human-readable problems.
import { isRecord } from './is-record.ts'
import { TEXTURE_LIMITS } from './texture-asset-rules.ts'
import { pngChunkTypes, readImageHeader } from './image-header.ts'
import type { ImageHeader, PngImageHeader, WebpImageHeader } from './image-header.ts'

const PNG_BIT_DEPTH = 8
const PNG_COLOR_TYPE_RGB = 2
const PNG_COLOR_TYPE_RGBA = 6
const PNG_COLOR_TYPES: readonly number[] = Object.freeze([PNG_COLOR_TYPE_RGB, PNG_COLOR_TYPE_RGBA])
const PNG_ANIMATION_CONTROL_CHUNK = 'acTL'
const PNG_REFUSED_CHUNKS: readonly string[] = Object.freeze([
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'cICP',
])

export interface TextureFileExpectation {
  readonly mediaType: string
  readonly image?: unknown
}

function pngProblems(header: PngImageHeader, bytes: Uint8Array): string[] {
  const problems: string[] = []
  if (header.bitDepth !== PNG_BIT_DEPTH) {
    problems.push(`PNG bit depth is ${header.bitDepth}, not ${PNG_BIT_DEPTH}`)
  }
  if (header.interlaced) problems.push('PNG is interlaced')
  if (!PNG_COLOR_TYPES.includes(header.colorType)) {
    problems.push(`PNG color type ${header.colorType} is not RGB or RGBA`)
  }
  const chunkTypes = pngChunkTypes(bytes)
  if (chunkTypes.includes(PNG_ANIMATION_CONTROL_CHUNK)) problems.push('PNG is animated')
  for (const chunkType of chunkTypes) {
    if (PNG_REFUSED_CHUNKS.includes(chunkType)) {
      problems.push(`PNG carries the refused color chunk ${chunkType}`)
    }
  }
  return problems
}

function webpProblems(header: WebpImageHeader): string[] {
  const problems: string[] = []
  if (header.animated) problems.push('WebP is animated')
  if (header.colorProfile) problems.push('WebP carries a color profile')
  return problems
}

function formatProblems(header: ImageHeader, bytes: Uint8Array): string[] {
  return header.mediaType === 'image/png' ? pngProblems(header, bytes) : webpProblems(header)
}

interface DeclaredSize {
  readonly width: number
  readonly height: number
}

function declaredSize(image: unknown): DeclaredSize | null {
  if (!isRecord(image)) return null
  const { width, height } = image
  return typeof width === 'number' && typeof height === 'number' ? { width, height } : null
}

function sizeProblems(header: ImageHeader, declared: DeclaredSize | null): string[] {
  if (declared === null) return []
  if (header.width === declared.width && header.height === declared.height) return []
  return [
    `image size ${header.width} by ${header.height} pixels differs from the declared ` +
      `${declared.width} by ${declared.height}`,
  ]
}

export function textureFileProblems(asset: TextureFileExpectation, bytes: Uint8Array): string[] {
  const header = readImageHeader(bytes)
  if (header === undefined || header.mediaType !== asset.mediaType) {
    return [`file bytes do not match the declared media type ${asset.mediaType}`]
  }
  return [...sizeProblems(header, declaredSize(asset.image)), ...formatProblems(header, bytes)]
}

export function textureFileSizeProblems(fileSize: number): string[] {
  if (fileSize <= TEXTURE_LIMITS.maxFileBytes) return []
  return [
    `file is ${fileSize} bytes, above the 8 MiB (${TEXTURE_LIMITS.maxFileBytes} byte) limit for a texture`,
  ]
}
