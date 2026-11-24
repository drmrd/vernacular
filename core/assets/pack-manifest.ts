// core/assets/pack-manifest.ts
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. Shared by the in-app pack loader and
// the pack CLI so both gates run on one definition. The media type knowledge
// it relies on lives in asset-description.ts.

import { declaresMediaTypes, MODEL_MEDIA_TYPES, TEXTURE_MEDIA_TYPES } from './asset-description.ts'
import { validateDistributionFields } from './distribution-fields.ts'
import { isRecord } from './is-record.ts'
import { licenseProblems } from './license-policy.ts'
import { isPositiveLengthMm, positiveLengthMmProblem } from './manifest-lengths.ts'
import { isSemanticVersion, SEMANTIC_VERSION_RULE } from './semantic-version.ts'
import { isSha256Hex } from './sha256-hex.ts'
import { validateTextureFields } from './texture-asset-rules.ts'

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

const PACK_FORMAT_VERSIONS: readonly number[] = Object.freeze([1, 2])

export interface PackValidationResult {
  valid: boolean
  errors: string[]
}

const URL_PREFIX_PATTERN = /^https?:\/\/\S+$/

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

function validateOptionalStringArray(
  source: Record<string, unknown>,
  descriptor: FieldDescriptor,
  errors: string[],
): void {
  const value = source[descriptor.key]
  if (value === undefined) {
    return
  }
  const isStringArray =
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  if (!isStringArray) {
    errors.push(`${resolveLabel(descriptor)} must be an array of non-empty strings`)
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
  if (!isRecord(dimensions)) {
    errors.push(`${label}.dimensions are required`)
    return
  }
  for (const axis of DIMENSION_AXES) {
    if (!isPositiveLengthMm(dimensions[axis])) {
      errors.push(positiveLengthMmProblem(`${label}.dimensions.${axis}`))
    }
  }
}

interface AssetContext {
  label: string
  formatVersion: unknown
}

function allowedMediaTypes(kind: unknown): readonly string[] {
  return kind === 'texture' ? TEXTURE_MEDIA_TYPES : MODEL_MEDIA_TYPES
}

function validateMediaType(
  source: Record<string, unknown>,
  context: AssetContext,
  errors: string[],
): void {
  const mediaType = source['mediaType']
  if (!declaresMediaTypes(context.formatVersion)) {
    if (mediaType !== undefined) {
      errors.push(
        `${context.label}.mediaType needs formatVersion 2; format 1 assets name no media type`,
      )
    }
    return
  }
  const allowed = allowedMediaTypes(source['kind'])
  if (!(typeof mediaType === 'string' && allowed.includes(mediaType))) {
    errors.push(`${context.label}.mediaType must be one of: ${allowed.join(', ')}`)
  }
}

function validateAssetFields(
  source: Record<string, unknown>,
  context: AssetContext,
  errors: string[],
): void {
  const { label } = context
  if (
    validateRequiredString(source, { key: 'contentHash', label: `${label}.contentHash` }, errors) &&
    !isSha256Hex(source['contentHash'])
  ) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  validateRequiredString(source, { key: 'name', label: `${label}.name` }, errors)
  if (validateRequiredString(source, { key: 'license', label: `${label}.license` }, errors)) {
    errors.push(...licenseProblems(String(source['license'])))
  }
  validateRequiredString(source, { key: 'attribution', label: `${label}.attribution` }, errors)
  validateRequiredStringArray(source, { key: 'eras', label: `${label}.eras` }, errors)
  validateOptionalStringArray(source, { key: 'styles', label: `${label}.styles` }, errors)
  validateRequiredStringArray(source, { key: 'categories', label: `${label}.categories` }, errors)
  validateOptionalUrl(source, { key: 'sourceUrl', label: `${label}.sourceUrl` }, errors)
  if (!ASSET_KINDS.includes(source['kind'] as AssetKind)) {
    errors.push(`${label}.kind must be one of: ${ASSET_KINDS.join(', ')}`)
  }
  validateMediaType(source, context, errors)
  validateDistributionFields(source, label, errors)
  if (source['kind'] === 'texture' && declaresMediaTypes(context.formatVersion)) {
    validateTextureFields(source, label, errors)
  } else {
    validateDimensions(source['dimensions'], label, errors)
  }
}

function validateAsset(asset: unknown, context: AssetContext, errors: string[]): void {
  const { label } = context
  if (!isRecord(asset)) {
    errors.push(`${label} must be an object`)
    return
  }
  validateAssetFields(asset, context, errors)
}

function validateAssets(assets: unknown, formatVersion: unknown, errors: string[]): void {
  if (!Array.isArray(assets)) {
    errors.push('assets must be an array')
    return
  }
  assets.forEach((asset, index) => {
    validateAsset(asset, { label: `assets[${index}]`, formatVersion }, errors)
  })
}

function isKnownFormatVersion(formatVersion: unknown): boolean {
  return typeof formatVersion === 'number' && PACK_FORMAT_VERSIONS.includes(formatVersion)
}

function validateFormatVersion(formatVersion: unknown, errors: string[]): void {
  if (formatVersion === undefined || isKnownFormatVersion(formatVersion)) return
  const newest = Math.max(...PACK_FORMAT_VERSIONS)
  errors.push(
    `formatVersion must be ${PACK_FORMAT_VERSIONS.join(' or ')}, ` +
      `but this pack declares ${JSON.stringify(formatVersion)}; ` +
      `the newest format this reader knows is ${newest}`,
  )
}

function validatePackFields(source: Record<string, unknown>, errors: string[]): void {
  validateFormatVersion(source['formatVersion'], errors)
  validateRequiredString(source, { key: 'packId' }, errors)
  if (validateRequiredString(source, { key: 'license' }, errors)) {
    errors.push(...licenseProblems(String(source['license'])))
  }
  validateRequiredString(source, { key: 'attribution' }, errors)
  if (
    validateRequiredString(source, { key: 'version' }, errors) &&
    !isSemanticVersion(source['version'])
  ) {
    errors.push(`version must be ${SEMANTIC_VERSION_RULE}`)
  }
  validateRequiredStringArray(source, { key: 'eras' }, errors)
  validateRequiredStringArray(source, { key: 'categories' }, errors)
  validateAssets(source['assets'], source['formatVersion'], errors)
}

/**
 * Validate a parsed pack manifest.
 */
export function validatePackManifest(manifest: unknown): PackValidationResult {
  if (!isRecord(manifest)) {
    return { valid: false, errors: ['manifest must be a JSON object'] }
  }
  const errors: string[] = []
  validatePackFields(manifest, errors)
  return { valid: errors.length === 0, errors }
}
