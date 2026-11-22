// core/assets/texture-asset-rules.ts
//
// Field rules for texture assets in a pack manifest (ADR-0219). Pure: it
// appends human-readable problems to the caller's error list.

type TextureFieldValidator = (
  asset: Record<string, unknown>,
  label: string,
  errors: string[],
) => void

export const TEXTURE_LIMITS = Object.freeze({
  minSidePixels: 64,
  maxSidePixels: 2048,
})

// The same bound as model dimensions in pack-manifest.ts, kept here because
// pack-manifest.ts imports this module.
const MAX_TILE_SIZE_MM = 100_000
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

function isPositiveTileLength(value: unknown): boolean {
  return (
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_TILE_SIZE_MM
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
    if (!isPositiveTileLength((tileSize as Record<string, unknown>)[side])) {
      errors.push(
        `${label}.tileSize.${side} must be a positive number of millimeters up to ${MAX_TILE_SIZE_MM}`,
      )
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
