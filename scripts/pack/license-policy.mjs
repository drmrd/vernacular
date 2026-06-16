// scripts/pack/license-policy.mjs
//
// The curated open-license policy for vernacular packs (design specification
// section 4.8). A redistribution-friendly allowlist, not the full SPDX list. Pure:
// no filesystem or process access. Shared by the manifest check and the build so
// both gate on one policy.

/**
 * Curated, redistribution-friendly open licenses (design specification section 4.8).
 * @typedef {'CC0-1.0'|'CC-BY-4.0'|'CC-BY-3.0'|'CC-BY-SA-4.0'|'CC-BY-SA-3.0'|'MIT'|'Apache-2.0'|'BSD-2-Clause'|'BSD-3-Clause'} RecognizedLicense
 */
export const RECOGNIZED_LICENSES = Object.freeze([
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
])

/**
 * Whether a license identifier is in the recognized open-license allowlist.
 * @param {string} licenseId
 * @returns {boolean}
 */
export function recognize(licenseId) {
  return RECOGNIZED_LICENSES.includes(licenseId)
}
