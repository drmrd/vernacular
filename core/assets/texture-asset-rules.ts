// core/assets/texture-asset-rules.ts
//
// Manifest field rules for texture assets in a pack (ADR-0219). Pure: it
// appends human-readable problems to the caller's error list.
import { isRecord } from './is-record.ts'
import { isPositiveLengthMm, positiveLengthMmProblem } from './manifest-lengths.ts'

export const TEXTURE_LIMITS = Object.freeze({
  minSidePixels: 64,
  maxSidePixels: 2048,
  maxFileBytes: 8_388_608,
})

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
  if (!isRecord(image)) {
    errors.push(`${label}.image is required`)
    return
  }
  for (const side of SIDES) {
    if (!isPowerOfTwoInRange(image[side])) {
      errors.push(
        `${label}.image.${side} must be a power of two from ` +
          `${TEXTURE_LIMITS.minSidePixels} to ${TEXTURE_LIMITS.maxSidePixels} pixels`,
      )
    }
  }
}

function validateTileSize(tileSize: unknown, label: string, errors: string[]): void {
  if (!isRecord(tileSize)) {
    errors.push(`${label}.tileSize is required`)
    return
  }
  for (const side of SIDES) {
    if (!isPositiveLengthMm(tileSize[side])) {
      errors.push(positiveLengthMmProblem(`${label}.tileSize.${side}`))
    }
  }
}

export function validateTextureFields(
  asset: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  validateImage(asset['image'], label, errors)
  validateTileSize(asset['tileSize'], label, errors)
  if (!COLOR_SPACES.includes(asset['colorSpace'] as string)) {
    errors.push(`${label}.colorSpace must be one of: ${COLOR_SPACES.join(', ')}`)
  }
  if (asset['dimensions'] !== undefined) {
    errors.push(`${label}.dimensions is not allowed on a texture`)
  }
}
