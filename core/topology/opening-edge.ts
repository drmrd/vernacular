import { distance } from '../geometry/point'
import type { Point } from '../model/types'
import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * The placement of an opening along its host wall, as far as edge resolution is
 * concerned. Kept as a local structural type so that core/topology stays
 * independent of core/scene (the deriver passes an `OpeningSceneNode`, which
 * structurally satisfies this shape).
 */
export interface OpeningPlacement {
  /** The opening's center in plan space, in millimeters. */
  center: Point
  /** The id of the wall the opening is positioned along, if it has one. */
  hostWallId?: string
}

/**
 * The result of resolving an opening to the specific graph edge that contains
 * it. A wall splits into several edges at every T-junction and interior
 * crossing, and every one of those edges carries the original wall id
 * (foundation specification section 3.3). An opening is positioned along the
 * whole wall, so it must resolve to the single edge whose span contains the
 * opening's center.
 */
export interface ResolvedOpeningEdge {
  /** The graph edge that contains the opening's center. */
  edge: GraphEdge
  /** The center's distance along the edge, measured from the edge's `a` vertex, in millimeters. */
  positionAlongEdge: number
}

/**
 * Resolve an opening to the graph edge that contains its center. Because a wall
 * splits into several edges that all carry its wall id (foundation specification
 * section 3.3), an opening positioned along the whole wall must be matched to the
 * specific edge whose span holds its center. The returned `positionAlongEdge` is
 * the center's distance from that edge's `a` vertex.
 *
 * Returns `null` when the opening has no host wall, and when no edge carrying the
 * host wall id contains the center (a degenerate graph).
 */
export function resolveOpeningEdge(
  opening: OpeningPlacement,
  graph: PlanarGraph,
): ResolvedOpeningEdge | null {
  if (opening.hostWallId === undefined) return null

  for (const edge of graph.edges) {
    if (edge.wallId !== opening.hostWallId) continue

    const a = graph.vertices[edge.a]
    const b = graph.vertices[edge.b]
    if (a === undefined || b === undefined) continue

    const length = distance(a, b)
    if (length === 0) continue

    // The center's distance from `a` along the `a -> b` direction: the dot
    // product of `(center - a)` with the `a -> b` direction, normalized by the
    // edge length to express it in millimeters along the edge.
    const dot = (opening.center.x - a.x) * (b.x - a.x) + (opening.center.y - a.y) * (b.y - a.y)
    const positionAlongEdge = dot / length
    if (positionAlongEdge >= 0 && positionAlongEdge <= length) {
      return { edge, positionAlongEdge }
    }
  }

  return null
}
