import { distance } from '../geometry/point'
import type { Point } from '../model/types'
import type { Room } from './rooms'
import type { PlanarGraph } from './wall-graph'
import type { WallFootprint } from './wall-footprint'

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

const COLLINEAR_TOLERANCE_MM = 1e-6

function distanceToChord(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
        )
  return distance(point, { x: from.x + along * dx, y: from.y + along * dy })
}

/**
 * The corners of an outline that matter: every vertex within 1e-6 mm of the chord between its two
 * neighbors is dropped, so a point that only splits a straight side does not count.
 */
export function outlineCorners(polygon: readonly Point[]): Point[] {
  return polygon.filter((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length] as Point
    const next = polygon[(index + 1) % polygon.length] as Point
    return distanceToChord(point, previous, next) > COLLINEAR_TOLERANCE_MM
  })
}

/** Whether the two lists hold the same number of points, and each point has one within `toleranceMm` in the other. */
export function samePointSet(
  a: readonly Point[],
  b: readonly Point[],
  toleranceMm: number,
): boolean {
  const hasNear = (points: readonly Point[], target: Point): boolean =>
    points.some((point) => distance(point, target) <= toleranceMm)
  return a.length === b.length && a.every((p) => hasNear(b, p)) && b.every((p) => hasNear(a, p))
}

/** How closely two rooms must agree to count as the same room. */
export interface RoomMatchTolerance {
  readonly outlineMm: number
  readonly areaRelative: number
}

/**
 * Lists the ids of the expected rooms that no actual room matches: the same outline corners (a
 * point set, within `outlineMm`) and a clear area within `areaRelative` of the larger area. An
 * empty list means every expected room was found.
 */
export function unmatchedRooms(
  expected: readonly Room[],
  actual: readonly Room[],
  tolerance: RoomMatchTolerance,
): string[] {
  const matches = (room: Room, other: Room): boolean => {
    const scale = Math.max(Math.abs(room.area), Math.abs(other.area))
    return (
      Math.abs(room.area - other.area) <= tolerance.areaRelative * scale &&
      samePointSet(outlineCorners(room.polygon), outlineCorners(other.polygon), tolerance.outlineMm)
    )
  }
  return expected
    .filter((room) => !actual.some((other) => matches(room, other)))
    .map((room) => room.id)
}

/**
 * The two corners of one edge at a vertex, sorted so two edges that share a corner pair list it the
 * same way. Throws `RangeError` when the edge does not end at the vertex.
 */
export function cornersAtVertex(
  graph: PlanarGraph,
  footprints: readonly WallFootprint[],
  at: { readonly edgeIndex: number; readonly vertexIndex: number },
): Point[] {
  const { edgeIndex, vertexIndex } = at
  const edge = graph.edges[edgeIndex]
  const footprint = footprints[edgeIndex]
  if (edge === undefined || footprint === undefined) throw new RangeError('no such edge')
  if (edge.a !== vertexIndex && edge.b !== vertexIndex) throw new RangeError('edge misses vertex')
  const corners =
    edge.a === vertexIndex
      ? [footprint.aPlus, footprint.aMinus]
      : [footprint.bPlus, footprint.bMinus]
  return corners.sort((p, q) => p.x - q.x || p.y - q.y)
}
