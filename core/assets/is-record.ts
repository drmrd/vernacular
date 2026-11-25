// core/assets/is-record.ts
//
// Narrowing guard shared by the pack manifest rules: true for any non-null
// object, arrays included, which is how those rules have always read a field.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Like isRecord but refuses arrays: a plain JSON object.
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}
