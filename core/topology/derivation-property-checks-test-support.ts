import type { Room } from './rooms'
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

/** One room as the invariance properties compare it: its wall ids joined, and its clear area. */
export interface RoomSignature {
  readonly walls: string
  readonly area: number
}

/** The rooms as pairs of their wall ids and clear area, sorted by wall ids, so order does not matter. */
export function roomSignature(rooms: readonly Room[]): RoomSignature[] {
  return rooms
    .map((room) => ({ walls: room.wallIds.join(','), area: room.area }))
    .sort((x, y) => x.walls.localeCompare(y.walls) || x.area - y.area)
}

/**
 * Lists how two signatures differ: a room whose wall ids differ, or whose area differs by more than
 * `relativeTolerance` of the larger area. An empty list means the same rooms, so a failure shows
 * every difference.
 */
export function signatureDifferences(
  expected: readonly RoomSignature[],
  actual: readonly RoomSignature[],
  relativeTolerance: number,
): string[] {
  if (expected.length !== actual.length) {
    return [`expected ${expected.length} rooms but found ${actual.length}`]
  }
  return expected.flatMap((room, index) => {
    const other = actual[index]
    if (other === undefined || other.walls !== room.walls) {
      return [`room ${index}: walls ${room.walls} became ${other?.walls}`]
    }
    const scale = Math.max(Math.abs(room.area), Math.abs(other.area))
    return Math.abs(room.area - other.area) <= relativeTolerance * scale
      ? []
      : [`room ${room.walls}: area ${room.area} became ${other.area}`]
  })
}
