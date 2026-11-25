// core/assets/license-moves.ts
//
// Which license changes of a published asset only grant more rights (ADR-0230),
// and which of several licenses a credit shows. Pure: no filesystem access.

const LICENSE_PUBLIC_DOMAIN = 'CC0-1.0'

const MORE_PERMISSIVE_LICENSES: ReadonlyMap<string, readonly string[]> = new Map([
  ['CC0-1.0', []],
  ['CC-BY-4.0', [LICENSE_PUBLIC_DOMAIN]],
  ['CC-BY-3.0', [LICENSE_PUBLIC_DOMAIN]],
  ['CC-BY-SA-4.0', ['CC-BY-4.0', LICENSE_PUBLIC_DOMAIN]],
  ['CC-BY-SA-3.0', ['CC-BY-3.0', LICENSE_PUBLIC_DOMAIN]],
  ['MIT', [LICENSE_PUBLIC_DOMAIN]],
  ['Apache-2.0', [LICENSE_PUBLIC_DOMAIN]],
  ['BSD-2-Clause', [LICENSE_PUBLIC_DOMAIN]],
  ['BSD-3-Clause', [LICENSE_PUBLIC_DOMAIN]],
])

/** A license may stay as it is or move to a more permissive one; an unknown license only stays. */
export function isAllowedLicenseMove(from: string, to: string): boolean {
  return from === to || (MORE_PERMISSIVE_LICENSES.get(from)?.includes(to) ?? false)
}

/**
 * The license every other one may move to, else the first when none dominates.
 * An empty list gives an empty string, so a caller never has to handle a throw.
 */
export function mostPermissiveLicense(licenses: readonly string[]): string {
  const dominant = licenses.find((candidate) =>
    licenses.every((other) => isAllowedLicenseMove(other, candidate)),
  )
  return dominant ?? licenses[0] ?? ''
}
