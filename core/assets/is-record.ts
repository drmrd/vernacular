// core/assets/is-record.ts
//
// Narrowing guards shared by the pack manifest rules. isRecord is true for any
// non-null object, arrays included, which is how those rules have always read
// a field. isPlainObject refuses arrays: a plain JSON object.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}
