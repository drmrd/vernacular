// scripts/pack/manifest-validation.mjs
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. When the in-app pack loader lands (phase 3)
// this schema graduates to core/ as shared TypeScript.

/** @typedef {{ valid: boolean, errors: string[] }} PackValidationResult */

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * The asset kinds a pack may declare (design specification section 4.5).
 * @typedef {'furniture'|'architectural-element'|'trim-profile'|'stair-component'|'material'|'texture'|'underlay-image'|'palette'|'preview-only'} AssetKind
 */
export const ASSET_KINDS = Object.freeze([
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

const SHA256_PATTERN = /^[0-9a-f]{64}$/

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string[]} errors
 * @param {string} [label]
 * @returns {boolean} whether the field was a non-empty string
 */
function validateRequiredString(source, key, errors, label = key) {
  const value = source[key]
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} is required`)
    return false
  }
  return true
}

/**
 * @param {unknown} asset
 * @param {number} index
 * @param {string[]} errors
 */
function validateAsset(asset, index, errors) {
  const label = `assets[${index}]`
  if (typeof asset !== 'object' || asset === null) {
    errors.push(`${label} must be an object`)
    return
  }
  const source = /** @type {Record<string, unknown>} */ (asset)
  if (
    validateRequiredString(source, 'contentHash', errors, `${label}.contentHash`) &&
    !SHA256_PATTERN.test(String(source.contentHash))
  ) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  validateRequiredString(source, 'name', errors, `${label}.name`)
  validateRequiredString(source, 'license', errors, `${label}.license`)
  if (!ASSET_KINDS.includes(source.kind)) {
    errors.push(`${label}.kind must be one of: ${ASSET_KINDS.join(', ')}`)
  }
}

/**
 * @param {unknown} assets
 * @param {string[]} errors
 */
function validateAssets(assets, errors) {
  if (!Array.isArray(assets)) {
    errors.push('assets must be an array')
    return
  }
  assets.forEach((asset, index) => validateAsset(asset, index, errors))
}

/**
 * Validate a parsed pack manifest.
 * @param {unknown} manifest
 * @returns {PackValidationResult}
 */
export function validatePackManifest(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest must be a JSON object'] }
  }
  const errors = []
  const source = /** @type {Record<string, unknown>} */ (manifest)
  validateRequiredString(source, 'packId', errors)
  validateRequiredString(source, 'license', errors)
  validateRequiredString(source, 'attribution', errors)
  if (
    validateRequiredString(source, 'version', errors) &&
    !SEMVER_PATTERN.test(String(source.version))
  ) {
    errors.push('version must be valid SemVer (for example 1.0.0)')
  }
  validateAssets(source.assets, errors)
  return { valid: errors.length === 0, errors }
}
