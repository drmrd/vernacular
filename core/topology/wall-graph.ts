import { distance } from '../geometry/point'
import { pointOnSegment, segmentIntersection } from '../geometry/segment'
import { DEFAULT_JUNCTION_TOLERANCE_MM, onOneLine } from '../geometry/tolerance'
import { nodeWallOverlaps } from './node-wall-overlaps'
import type { WallPart } from './uncovered-parts'
import type { Point, Wall } from '../model/types'

/** An edge connecting two vertices of the planar graph, carrying its source wall's id. */
export interface GraphEdge {
  /** Index into {@link PlanarGraph.vertices} of the edge's first endpoint. */
  a: number
  /** Index into {@link PlanarGraph.vertices} of the edge's second endpoint. */
  b: number
  /** The id of the wall this edge was derived from. */
  wallId: string
  /** Later walls covering the same stretch, in floor order. */
  covers?: string[]
}

/** A planar graph of merged wall endpoints (vertices) and the walls between them (edges). */
export interface PlanarGraph {
  vertices: Point[]
  edges: GraphEdge[]
}

/**
 * Build a planar graph from a set of walls. Endpoints within tolerance of an
 * already-seen vertex are merged into a single junction; zero-length walls
 * (both endpoints within tolerance of each other) are skipped. Walls are split
 * at interior junctions, and the first wall owns each shared stretch.
 */
export function buildWallGraph(
  walls: readonly Wall[],
  options?: { tolerance?: number },
): PlanarGraph {
  const tolerance = options?.tolerance ?? DEFAULT_JUNCTION_TOLERANCE_MM
  const vertices: Point[] = []
  const edges: GraphEdge[] = []

  // Linear scan per endpoint (O(n^2) over all walls) is acceptable for the
  // expected wall counts; switch to a spatial index if profiling flags it.
  function vertexIndexFor(point: Point): number {
    for (const [index, vertex] of vertices.entries()) {
      if (distance(vertex, point) <= tolerance) return index
    }
    vertices.push(point)
    return vertices.length - 1
  }

  const ownerStretches: WallPart[] = []
  for (const wall of walls) {
    if (distance(wall.start, wall.end) <= tolerance) continue
    const parts = nodeWallOverlaps(wall, ownerStretches, tolerance)
    parts.forEach((part) => {
      const a = vertexIndexFor(part.start)
      const b = vertexIndexFor(part.end)
      if (parts.length > 1 && a === b) return
      edges.push({ a, b, wallId: wall.id })
      if (!part.covered) {
        ownerStretches.push({ start: vertices[a] ?? part.start, end: vertices[b] ?? part.end })
      }
    })
  }

  // Crossing pass: register each interior X-crossing between a pair of edges as
  // a graph vertex. The splitting pass below then splits both crossing edges at
  // that shared vertex.
  registerInteriorCrossings(edges, vertices, vertexIndexFor, tolerance)

  // Splitting pass: where another vertex lies on an edge's interior (a
  // T-junction), replace that edge with a chain of sub-edges between the
  // ordered split points. Only vertices already present in the graph are
  // considered; X-crossings are not introduced here.
  const splitEdges = edges.flatMap((edge) => splitEdgeAtInteriorVertices(edge, vertices, tolerance))

  return { vertices, edges: assignStretchOwners(splitEdges) }
}

/** Duplicate stretches leave a junction at the same angle and confuse the room walk. */
function assignStretchOwners(edges: readonly GraphEdge[]): GraphEdge[] {
  const ownerByStretch = new Map<string, GraphEdge>()
  const retainedEdges: GraphEdge[] = []

  for (const edge of edges) {
    const { a, b } = edge
    if (a === b) {
      retainedEdges.push(edge)
      continue
    }

    const stretch = `${Math.min(a, b)}:${Math.max(a, b)}`
    const owner = ownerByStretch.get(stretch)
    if (owner !== undefined) {
      const coveredWallIds = (owner.covers ??= [])
      coveredWallIds.push(edge.wallId)
      continue
    }

    const ownedEdge = { ...edge }
    if (edge.covers !== undefined) ownedEdge.covers = [...edge.covers]
    ownerByStretch.set(stretch, ownedEdge)
    retainedEdges.push(ownedEdge)
  }

  return retainedEdges
}

/**
 * Register every interior X-crossing between an unordered pair of edges as a
 * graph vertex (merged through the same endpoint helper). The caller's splitting
 * pass then splits both crossing edges at the shared vertex.
 */
// eslint-disable-next-line max-params -- crossings use the same tolerance as endpoint registration
function registerInteriorCrossings(
  edges: readonly GraphEdge[],
  vertices: readonly Point[],
  vertexIndexFor: (point: Point) => number,
  tolerance: number,
): void {
  for (const [firstPosition, first] of edges.entries()) {
    const firstA = vertices[first.a]
    const firstB = vertices[first.b]
    if (firstA === undefined || firstB === undefined) continue

    for (const second of edges.slice(firstPosition + 1)) {
      const secondA = vertices[second.a]
      const secondB = vertices[second.b]
      if (secondA === undefined || secondB === undefined) continue

      if (onOneLine(firstA, firstB, secondA, secondB, tolerance)) continue
      const crossing = segmentIntersection(firstA, firstB, secondA, secondB)
      if (crossing !== null) vertexIndexFor(crossing)
    }
  }
}

/**
 * Replace a single edge with the chain of sub-edges produced by splitting it at
 * every existing vertex on its interior. Returns the original edge unchanged
 * when no interior vertex lies on it. Each sub-edge carries the original edge's
 * wall id.
 */
function splitEdgeAtInteriorVertices(
  edge: GraphEdge,
  vertices: readonly Point[],
  tolerance: number,
): GraphEdge[] {
  const a = vertices[edge.a]
  const b = vertices[edge.b]
  if (a === undefined || b === undefined) return [edge]

  const interiorIndices: number[] = []
  for (const [index, vertex] of vertices.entries()) {
    if (index === edge.a || index === edge.b) continue
    if (pointOnSegment(vertex, a, b, tolerance)) interiorIndices.push(index)
  }

  if (interiorIndices.length === 0) return [edge]

  const ordered = [edge.a, ...interiorIndices, edge.b].sort(
    // Every index in `ordered` is a valid vertex index, so the `?? a` fallback
    // is unreachable; it exists only to satisfy noUncheckedIndexedAccess.
    (left, right) =>
      projectionParameter(vertices[left] ?? a, a, b) -
      projectionParameter(vertices[right] ?? a, a, b),
  )

  const subEdges: GraphEdge[] = []
  for (const [position, from] of ordered.slice(0, -1).entries()) {
    // Iterating the slice without the last element guarantees a successor
    // exists, so the undefined guard only satisfies noUncheckedIndexedAccess.
    const to = ordered[position + 1]
    if (to === undefined) continue
    subEdges.push({ a: from, b: to, wallId: edge.wallId })
  }
  return subEdges
}

/**
 * Parameter of point p projected onto the line through a and b, measured along
 * the a -> b direction. Used only to order split points along an edge, so the
 * raw dot product (unnormalized by the segment length) is sufficient.
 */
function projectionParameter(p: Point, a: Point, b: Point): number {
  return (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
}
