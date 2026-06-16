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

/**
 * Share-alike licenses: redistribution-friendly but viral, so redistribution
 * must preserve their terms. Warned about when mixed with other licenses.
 * @typedef {'CC-BY-SA-4.0'|'CC-BY-SA-3.0'} ShareAlikeLicense
 */
export const SHARE_ALIKE_LICENSES = Object.freeze(['CC-BY-SA-4.0', 'CC-BY-SA-3.0'])

/**
 * Whether a license identifier carries share-alike terms.
 * @param {string} licenseId
 * @returns {boolean}
 */
export function isShareAlike(licenseId) {
  return SHARE_ALIKE_LICENSES.includes(licenseId)
}

/**
 * Licenses that conflict with an openly redistributable, modifiable pack
 * (NonCommercial / NoDerivatives). They cannot ship in an open pack.
 * @typedef {'CC-BY-NC-4.0'|'CC-BY-NC-3.0'|'CC-BY-NC-SA-4.0'|'CC-BY-ND-4.0'|'CC-BY-ND-3.0'|'CC-BY-NC-ND-4.0'} NonRedistributableLicense
 */
export const NON_REDISTRIBUTABLE_LICENSES = Object.freeze([
  'CC-BY-NC-4.0',
  'CC-BY-NC-3.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-ND-3.0',
  'CC-BY-NC-ND-4.0',
])

/**
 * Whether a license identifier forbids redistribution in an open pack.
 * @param {string} licenseId
 * @returns {boolean}
 */
export function isNoRedistribution(licenseId) {
  return NON_REDISTRIBUTABLE_LICENSES.includes(licenseId)
}

/**
 * Hard license errors for one identifier: a no-redistribution license cannot ship
 * in an open pack, and an unrecognized license is not on the curated allowlist.
 * @param {string} licenseId
 * @returns {string[]}
 */
export function licenseProblems(licenseId) {
  if (isNoRedistribution(licenseId)) {
    return [`license "${licenseId}" forbids redistribution and cannot ship in an open pack`]
  }
  if (!recognize(licenseId)) {
    return [`license "${licenseId}" is not a recognized open license`]
  }
  return []
}
