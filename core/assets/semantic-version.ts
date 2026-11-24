// core/assets/semantic-version.ts
//
// The one definition of a version: Semantic Versioning 2.0.0 without build
// metadata. Pack versions and catalog asset id versions share it.

const VERSION_NUMBER = String.raw`(?:0|[1-9][0-9]*)`
const PRERELEASE_PART = String.raw`(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`

const SEMANTIC_VERSION_PATTERN = new RegExp(
  String.raw`^${VERSION_NUMBER}\.${VERSION_NUMBER}\.${VERSION_NUMBER}(?:-${PRERELEASE_PART}(?:\.${PRERELEASE_PART})*)?$`,
)

export const SEMANTIC_VERSION_RULE = 'a Semantic Version without build metadata (for example 1.0.0)'

export function isSemanticVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMANTIC_VERSION_PATTERN.test(value)
}
