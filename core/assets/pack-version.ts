// core/assets/pack-version.ts
//
// Semantic Versioning 2.0.0 precedence (section 11) for pack versions. The
// grammar lives in semantic-version.ts; this comparator does not validate.

const BEFORE = -1
const EQUAL = 0
const AFTER = 1
const BUILD_METADATA_SEPARATOR = '+'
const PRERELEASE_SEPARATOR = '-'
const IDENTIFIER_SEPARATOR = '.'
const NUMERIC_IDENTIFIER = /^[0-9]+$/

type ParsedVersion = { core: string[]; prerelease: string[] }

function parseVersion(version: string): ParsedVersion {
  const withoutBuild = version.split(BUILD_METADATA_SEPARATOR, 1)[0] ?? ''
  const prereleaseStart = withoutBuild.indexOf(PRERELEASE_SEPARATOR)
  if (prereleaseStart === -1) {
    return { core: withoutBuild.split(IDENTIFIER_SEPARATOR), prerelease: [] }
  }
  return {
    core: withoutBuild.slice(0, prereleaseStart).split(IDENTIFIER_SEPARATOR),
    prerelease: withoutBuild.slice(prereleaseStart + 1).split(IDENTIFIER_SEPARATOR),
  }
}

function compareOrdered(a: string | number, b: string | number): number {
  if (a === b) return EQUAL
  return a < b ? BEFORE : AFTER
}

function compareNumericText(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? BEFORE : AFTER
  return compareOrdered(a, b)
}

function comparePrereleaseIdentifier(a: string, b: string): number {
  const aIsNumeric = NUMERIC_IDENTIFIER.test(a)
  const bIsNumeric = NUMERIC_IDENTIFIER.test(b)
  if (aIsNumeric && bIsNumeric) return compareNumericText(a, b)
  if (aIsNumeric) return BEFORE
  if (bIsNumeric) return AFTER
  return compareOrdered(a, b)
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return compareOrdered(b.length, a.length)
  const shared = Math.min(a.length, b.length)
  for (let index = 0; index < shared; index += 1) {
    const result = comparePrereleaseIdentifier(a[index] ?? '', b[index] ?? '')
    if (result !== EQUAL) return result
  }
  return compareOrdered(a.length, b.length)
}

export function comparePackVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let index = 0; index < left.core.length; index += 1) {
    const result = compareNumericText(left.core[index] ?? '', right.core[index] ?? '')
    if (result !== EQUAL) return result
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}
