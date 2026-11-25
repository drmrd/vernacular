// core/assets/distribution-fields.ts
//
// Manifest rules for the four optional distribution fields of an asset:
// byteLength, thumbnail, copyright, and changes. An absent field is valid.
// Pure: it appends human-readable problems to the caller's error list.
import { isPlainObject } from './is-record.ts'
import { isSha256Hex } from './sha256-hex.ts'

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateByteLength(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && !isPositiveInteger(value)) {
    errors.push(`${label} must be a positive integer`)
  }
}

function validateThumbnail(thumbnail: unknown, label: string, errors: string[]): void {
  if (thumbnail === undefined) {
    return
  }
  if (!isPlainObject(thumbnail)) {
    errors.push(`${label} must be an object`)
    return
  }
  if (!isSha256Hex(thumbnail['contentHash'])) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  if (!isPositiveInteger(thumbnail['byteLength'])) {
    errors.push(`${label}.byteLength must be a positive integer`)
  }
}

function validateCopyright(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
    errors.push(`${label} must be a non-empty string`)
  }
}

function validateChanges(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${label} must be a string`)
  }
}

export function validateDistributionFields(
  asset: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  validateByteLength(asset['byteLength'], `${label}.byteLength`, errors)
  validateThumbnail(asset['thumbnail'], `${label}.thumbnail`, errors)
  validateCopyright(asset['copyright'], `${label}.copyright`, errors)
  validateChanges(asset['changes'], `${label}.changes`, errors)
}
