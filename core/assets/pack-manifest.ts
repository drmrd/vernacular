// core/assets/pack-manifest.ts
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. Shared by the in-app pack loader and
// the pack CLI so both gates run on one definition.

import { licenseProblems } from './license-policy.ts'

export type AssetKind =
  | 'furniture'
  | 'architectural-element'
  | 'trim-profile'
  | 'stair-component'
  | 'material'
  | 'texture'
  | 'underlay-image'
  | 'palette'
  | 'preview-only'

export const ASSET_KINDS: readonly AssetKind[] = Object.freeze([
  'furniture',
  'architectural-element',
  'trim-profile',
  'stair-component',
  'material',
  'texture',
  'underlay-image',
  'palette',
  'preview-only',
])

export interface PackValidationResult {
  valid: boolean
  errors: string[]
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const URL_PREFIX_PATTERN = /^https?:\/\/\S+$/

// A generous 100 m ceiling (in millimeters) that still catches unit mistakes
// such as meters entered as millimeters.
const MAX_DIMENSION_MM = 100_000
const DIMENSION_AXES = ['width', 'depth', 'height'] as const

interface FieldDescriptor {
  key: string
  label?: string
}

function resolveLabel(descriptor: FieldDescriptor): string {
  return descriptor.label ?? descriptor.key
}

function validateRequiredString(
  source: Record<string, unknown>,
  descriptor: FieldDescriptor,
  errors: string[],
): boolean {
  const value = source[descriptor.key]
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${resolveLabel(descriptor)} is required`)
    return false
  }
  return true
}

function validateRequiredStringArray(
  source: Record<string, unknown>,
  descriptor: FieldDescriptor,
  errors: string[],
): void {
  const value = source[descriptor.key]
  const isNonEmptyStringArray =
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  if (!isNonEmptyStringArray) {
    errors.push(`${resolveLabel(descriptor)} must be a non-empty array of strings`)
  }
}

function validateOptionalUrl(
  source: Record<string, unknown>,
  descriptor: FieldDescriptor,
  errors: string[],
): void {
  const value = source[descriptor.key]
  if (value === undefined) {
    return
  }
  if (typeof value !== 'string' || !URL_PREFIX_PATTERN.test(value)) {
    errors.push(`${resolveLabel(descriptor)} must be an http(s) URL`)
  }
}

function validateDimensions(dimensions: unknown, label: string, errors: string[]): void {
  if (typeof dimensions !== 'object' || dimensions === null) {
    errors.push(`${label}.dimensions are required`)
    return
  }
  const source = dimensions as Record<string, unknown>
  for (const axis of DIMENSION_AXES) {
    const value = source[axis]
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > MAX_DIMENSION_MM
    ) {
      errors.push(
        `${label}.dimensions.${axis} must be a positive number of millimeters up to ${MAX_DIMENSION_MM}`,
      )
    }
  }
}

function validateAssetFields(
  source: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  if (
    validateRequiredString(source, { key: 'contentHash', label: `${label}.contentHash` }, errors) &&
    !SHA256_PATTERN.test(String(source['contentHash']))
  ) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  validateRequiredString(source, { key: 'name', label: `${label}.name` }, errors)
  if (validateRequiredString(source, { key: 'license', label: `${label}.license` }, errors)) {
    errors.push(...licenseProblems(String(source['license'])))
  }
  validateRequiredString(source, { key: 'attribution', label: `${label}.attribution` }, errors)
  validateRequiredStringArray(source, { key: 'eras', label: `${label}.eras` }, errors)
  validateRequiredStringArray(source, { key: 'categories', label: `${label}.categories` }, errors)
  validateOptionalUrl(source, { key: 'sourceUrl', label: `${label}.sourceUrl` }, errors)
  if (!ASSET_KINDS.includes(source['kind'] as AssetKind)) {
    errors.push(`${label}.kind must be one of: ${ASSET_KINDS.join(', ')}`)
  }
  validateDimensions(source['dimensions'], label, errors)
}

function validateAsset(asset: unknown, index: number, errors: string[]): void {
  const label = `assets[${index}]`
  if (typeof asset !== 'object' || asset === null) {
    errors.push(`${label} must be an object`)
    return
  }
  validateAssetFields(asset as Record<string, unknown>, label, errors)
}

function validateAssets(assets: unknown, errors: string[]): void {
  if (!Array.isArray(assets)) {
    errors.push('assets must be an array')
    return
  }
  assets.forEach((asset, index) => {
    validateAsset(asset, index, errors)
  })
}

function validatePackFields(source: Record<string, unknown>, errors: string[]): void {
  validateRequiredString(source, { key: 'packId' }, errors)
  if (validateRequiredString(source, { key: 'license' }, errors)) {
    errors.push(...licenseProblems(String(source['license'])))
  }
  validateRequiredString(source, { key: 'attribution' }, errors)
  if (
    validateRequiredString(source, { key: 'version' }, errors) &&
    !SEMVER_PATTERN.test(String(source['version']))
  ) {
    errors.push('version must be valid SemVer (for example 1.0.0)')
  }
  validateRequiredStringArray(source, { key: 'eras' }, errors)
  validateRequiredStringArray(source, { key: 'categories' }, errors)
  validateAssets(source['assets'], errors)
}

/**
 * Validate a parsed pack manifest.
 */
export function validatePackManifest(manifest: unknown): PackValidationResult {
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest must be a JSON object'] }
  }
  const errors: string[] = []
  validatePackFields(manifest as Record<string, unknown>, errors)
  return { valid: errors.length === 0, errors }
}
