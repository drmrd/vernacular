// core/assets/semantic-version.ts
//
// The one definition of a pack version: Semantic Versioning 2.0.0.

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function isSemanticVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMANTIC_VERSION_PATTERN.test(value)
}
