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

/** The item at `index`, counted around the list, so the last item is followed by the first. */
export function cyclic<T>(items: readonly T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length]
  if (item === undefined) throw new RangeError('the list is empty')
  return item
}

/** The smallest turn, in radians, between a corner's incoming and outgoing side in a closed ring. */
export function sharpestTurn(corners: readonly { x: number; y: number }[]): number {
  const turns = corners.map((corner, k) => {
    const before = cyclic(corners, k - 1)
    const after = cyclic(corners, k + 1)
    const inX = corner.x - before.x
    const inY = corner.y - before.y
    const outX = after.x - corner.x
    const outY = after.y - corner.y
    return Math.atan2(Math.abs(inX * outY - inY * outX), inX * outX + inY * outY)
  })
  return Math.min(...turns)
}
