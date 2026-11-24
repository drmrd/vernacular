import type { PlanarGraph } from './wall-graph'

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

/** Counts the connected components of the graph: every vertex is one, until an edge joins it to another. */
export function componentCount(graph: PlanarGraph): number {
  const parent = graph.vertices.map((_, index) => index)
  const root = (vertex: number): number => {
    const next = parent[vertex] ?? vertex
    return next === vertex ? vertex : root(next)
  }
  let components = graph.vertices.length
  for (const edge of graph.edges) {
    const rootA = root(edge.a)
    const rootB = root(edge.b)
    if (rootA !== rootB) {
      parent[rootA] = rootB
      components -= 1
    }
  }
  return components
}
