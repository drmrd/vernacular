// core/assets/license-policy.ts
//
// The curated open-license policy for vernacular packs (design specification
// section 4.8). A redistribution-friendly allowlist, not the full SPDX list. Pure:
// no filesystem or process access. Shared by the in-app loader, the pack CLI,
// and the manifest check so all gates run on one policy.

/**
 * Curated, redistribution-friendly open licenses (design specification section 4.8).
 */
export const RECOGNIZED_LICENSES: readonly string[] = Object.freeze([
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
 * Share-alike licenses: redistribution-friendly but viral, so redistribution
 * must preserve their terms. Warned about when mixed with other licenses.
 */
export const SHARE_ALIKE_LICENSES: readonly string[] = Object.freeze([
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
])

/**
 * Licenses that conflict with an openly redistributable, modifiable pack
 * (NonCommercial / NoDerivatives). They cannot ship in an open pack.
 */
export const NON_REDISTRIBUTABLE_LICENSES: readonly string[] = Object.freeze([
  'CC-BY-NC-4.0',
  'CC-BY-NC-3.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-ND-3.0',
  'CC-BY-NC-ND-4.0',
])

/**
 * Whether a license identifier is in the recognized open-license allowlist.
 */
export function recognize(licenseId: string): boolean {
  return RECOGNIZED_LICENSES.includes(licenseId)
}

/**
 * Whether a license identifier carries share-alike terms.
 */
export function isShareAlike(licenseId: string): boolean {
  return SHARE_ALIKE_LICENSES.includes(licenseId)
}

/**
 * Whether a license identifier forbids redistribution in an open pack.
 */
export function isNoRedistribution(licenseId: string): boolean {
  return NON_REDISTRIBUTABLE_LICENSES.includes(licenseId)
}

/**
 * Hard license errors for one identifier: a no-redistribution license cannot ship
 * in an open pack, and an unrecognized license is not on the curated allowlist.
 */
export function licenseProblems(licenseId: string): string[] {
  if (isNoRedistribution(licenseId)) {
    return [`license "${licenseId}" forbids redistribution and cannot ship in an open pack`]
  }
  if (!recognize(licenseId)) {
    return [`license "${licenseId}" is not a recognized open license`]
  }
  return []
}

/**
 * A pack-wide warning when a share-alike license is mixed with other distinct
 * licenses, so redistribution must preserve the share-alike terms.
 */
export function shareAlikeWarning(licenseIds: readonly string[]): string | null {
  const distinct = [...new Set(licenseIds)]
  if (distinct.some(isShareAlike) && distinct.length > 1) {
    return 'pack mixes a share-alike license with other licenses; redistribution must preserve the share-alike terms'
  }
  return null
}
