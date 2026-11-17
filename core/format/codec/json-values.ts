/** The value as a plain object when it is one; undefined for null, an array, or a non-object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  const isRecord = typeof value === 'object' && value !== null && !Array.isArray(value)
  return isRecord ? (value as Record<string, unknown>) : undefined
}

/** Whether the value is a number with no fractional part; a stored version or revision is one. */
export function isInteger(value: unknown): value is number {
  return Number.isInteger(value)
}
