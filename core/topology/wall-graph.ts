import { distance } from '../geometry/point'
import type { Point, Wall } from '../model/types'

/** An edge connecting two vertices of the planar graph, carrying its source wall's id. */
export interface GraphEdge {
  /** Index into {@link PlanarGraph.vertices} of the edge's first endpoint. */
  a: number
  /** Index into {@link PlanarGraph.vertices} of the edge's second endpoint. */
  b: number
  /** The id of the wall this edge was derived from. */
  wallId: string
}

/** A planar graph of merged wall endpoints (vertices) and the walls between them (edges). */
export interface PlanarGraph {
  vertices: Point[]
  edges: GraphEdge[]
}

/**
 * Endpoints within this many millimeters of an already-seen vertex are merged
 * into a single junction. See the design specification, section 3.5.
 */
export const DEFAULT_JUNCTION_TOLERANCE_MM = 1

/**
 * Build a planar graph from a set of walls. Endpoints within tolerance of an
 * already-seen vertex are merged into a single junction; zero-length walls
 * (both endpoints within tolerance of each other) are skipped. Each remaining
 * wall contributes one edge between its two distinct vertex indices.
 */
export function buildWallGraph(
  walls: readonly Wall[],
  options?: { tolerance?: number },
): PlanarGraph {
  const tolerance = options?.tolerance ?? DEFAULT_JUNCTION_TOLERANCE_MM
  const vertices: Point[] = []
  const edges: GraphEdge[] = []

  function vertexIndexFor(point: Point): number {
    for (const [index, vertex] of vertices.entries()) {
      if (distance(vertex, point) <= tolerance) return index
    }
    vertices.push(point)
    return vertices.length - 1
  }

  for (const wall of walls) {
    if (distance(wall.start, wall.end) <= tolerance) continue
    const a = vertexIndexFor(wall.start)
    const b = vertexIndexFor(wall.end)
    edges.push({ a, b, wallId: wall.id })
  }

  return { vertices, edges }
}
