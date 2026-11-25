// core/assets/license-moves.ts
//
// Which license changes of a published asset only grant more rights (ADR-0230),
// and which of several licenses a credit shows. Pure: no filesystem access.

import { RECOGNIZED_LICENSES } from './license-policy.ts'

const LICENSE_PUBLIC_DOMAIN = 'CC0-1.0'

/** Each share-alike license may relax to its attribution-only twin of the same version. */
const SHARE_ALIKE_ATTRIBUTION: ReadonlyMap<string, string> = new Map([
  ['CC-BY-SA-4.0', 'CC-BY-4.0'],
  ['CC-BY-SA-3.0', 'CC-BY-3.0'],
])

/**
 * A license may stay as it is or move to a more permissive one; an unknown license only stays.
 * Only a recognized license may move to CC0-1.0, because publishing accepts only recognized licenses.
 */
export function isAllowedLicenseMove(from: string, to: string): boolean {
  return (
    from === to ||
    (RECOGNIZED_LICENSES.includes(from) && to === LICENSE_PUBLIC_DOMAIN) ||
    SHARE_ALIKE_ATTRIBUTION.get(from) === to
  )
}

/**
 * The license every other one may move to, else the first when none dominates.
 * Callers always pass at least one license, because a published asset always has one;
 * an empty list gives an empty string only to keep the function total.
 */
export function mostPermissiveLicense(licenses: readonly string[]): string {
  const dominant = licenses.find((candidate) =>
    licenses.every((other) => isAllowedLicenseMove(other, candidate)),
  )
  return dominant ?? licenses[0] ?? ''
}
