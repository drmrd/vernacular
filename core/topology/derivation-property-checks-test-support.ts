/**
 * Walks objects and arrays and lists the path of every number that is not finite, such as
 * `rooms[2].holes[0][1].x`. An empty list means every number is finite.
 */
export function nonFiniteNumberPaths(value: unknown, path = 'value'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path]
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => nonFiniteNumberPaths(item, `${path}[${index}]`))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      nonFiniteNumberPaths(item, `${path}.${key}`),
    )
  }
  return []
}
