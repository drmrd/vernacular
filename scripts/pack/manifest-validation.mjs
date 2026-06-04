// scripts/pack/manifest-validation.mjs
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. When the in-app pack loader lands (phase 3)
// this schema graduates to core/ as shared TypeScript.

/** @typedef {{ valid: boolean, errors: string[] }} PackValidationResult */

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

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
  return { valid: errors.length === 0, errors }
}
