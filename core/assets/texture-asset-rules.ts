// core/assets/texture-asset-rules.ts
//
// Field rules for texture assets in a pack manifest (ADR-0219). Pure: it
// appends human-readable problems to the caller's error list.
import { pngChunkTypes, readImageHeader } from './image-header.ts'
import type { ImageHeader, PngImageHeader, WebpImageHeader } from './image-header.ts'
import { isPositiveLengthMm, positiveLengthMmProblem } from './manifest-lengths.ts'

type TextureFieldValidator = (
  asset: Record<string, unknown>,
  label: string,
  errors: string[],
) => void

export const TEXTURE_LIMITS = Object.freeze({
  minSidePixels: 64,
  maxSidePixels: 2048,
  maxFileBytes: 8_388_608,
})

const PNG_BIT_DEPTH = 8
const PNG_COLOR_TYPE_RGB = 2
const PNG_COLOR_TYPE_RGBA = 6
const PNG_COLOR_TYPES: readonly number[] = [PNG_COLOR_TYPE_RGB, PNG_COLOR_TYPE_RGBA]
const PNG_REFUSED_CHUNKS: readonly string[] = ['gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP']

const COLOR_SPACES: readonly string[] = Object.freeze(['srgb', 'linear'])
const SIDES = ['width', 'height'] as const

function isPowerOfTwoInRange(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= TEXTURE_LIMITS.minSidePixels &&
    value <= TEXTURE_LIMITS.maxSidePixels &&
    (value & (value - 1)) === 0
  )
}

function validateImage(image: unknown, label: string, errors: string[]): void {
  if (typeof image !== 'object' || image === null) {
    errors.push(`${label}.image is required`)
    return
  }
  for (const side of SIDES) {
    if (!isPowerOfTwoInRange((image as Record<string, unknown>)[side])) {
      errors.push(
        `${label}.image.${side} must be a power of two from ` +
          `${TEXTURE_LIMITS.minSidePixels} to ${TEXTURE_LIMITS.maxSidePixels} pixels`,
      )
    }
  }
}

function validateTileSize(tileSize: unknown, label: string, errors: string[]): void {
  if (typeof tileSize !== 'object' || tileSize === null) {
    errors.push(`${label}.tileSize is required`)
    return
  }
  for (const side of SIDES) {
    if (!isPositiveLengthMm((tileSize as Record<string, unknown>)[side])) {
      errors.push(positiveLengthMmProblem(`${label}.tileSize.${side}`))
    }
  }
}

export const validateTextureFields: TextureFieldValidator = (asset, label, errors) => {
  validateImage(asset['image'], label, errors)
  validateTileSize(asset['tileSize'], label, errors)
  if (!COLOR_SPACES.includes(asset['colorSpace'] as string)) {
    errors.push(`${label}.colorSpace must be one of: ${COLOR_SPACES.join(', ')}`)
  }
  if (asset['dimensions'] !== undefined) {
    errors.push(`${label}.dimensions is not allowed on a texture`)
  }
}

export interface TextureFileExpectation {
  readonly mediaType: string
  readonly image: { readonly width: number; readonly height: number }
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
  for (const chunkType of pngChunkTypes(bytes)) {
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

export function textureFileProblems(asset: TextureFileExpectation, bytes: Uint8Array): string[] {
  const header = readImageHeader(bytes)
  if (header?.mediaType !== asset.mediaType) {
    return [`file bytes do not match the declared media type ${asset.mediaType}`]
  }
  const sizeProblems =
    header.width === asset.image.width && header.height === asset.image.height
      ? []
      : [
          `file size ${header.width} by ${header.height} differs from the declared ` +
            `width ${asset.image.width} and height ${asset.image.height}`,
        ]
  return [...sizeProblems, ...formatProblems(header, bytes)]
}
