function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function graftObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    result[key] = key in previous ? graftUnknown(previous[key], next[key]) : next[key]
  }
  for (const key of Object.keys(previous)) {
    // A key the next document lacks is unknown or reserved data the reader dropped; preserve it.
    if (!(key in next)) {
      result[key] = previous[key]
    }
  }
  return result
}

function idOf(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined
}

function graftArray(previous: readonly unknown[], next: readonly unknown[]): unknown[] {
  return next.map((item) => {
    const id = idOf(item)
    const match =
      id === undefined ? undefined : previous.find((candidate) => idOf(candidate) === id)
    return match === undefined ? item : graftUnknown(match, item)
  })
}

/**
 * Re-graft any value the previous Document carried that the next Document dropped, so a
 * read-modify-write cycle preserves extension payloads and reserved keys a reader does not
 * model (VFPF section 6.4). Shared keys take the next value; previous-only keys are restored.
 */
export function graftUnknown(previous: unknown, next: unknown): unknown {
  if (Array.isArray(previous) && Array.isArray(next)) {
    return graftArray(previous, next)
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    return graftObject(previous, next)
  }
  return next
}
