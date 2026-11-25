import {
  distance,
  dot,
  edgeCarriesWall,
  resolveOpeningEdge,
  subtract,
  type GraphEdge,
  type OpeningSceneNode,
  type PlanarGraph,
} from '../../core'

export interface EdgeOpening {
  opening: OpeningSceneNode
  positionAlongEdge: number
  clippedEnds: number[]
}

function sameMembership(first: GraphEdge, second: GraphEdge): boolean {
  const covered = first.covers ?? []
  return (
    first.wallId === second.wallId &&
    covered.length === (second.covers?.length ?? 0) &&
    covered.every((id, index) => id === second.covers?.[index])
  )
}

/** Follow the opening along its authored wall only through changes of stretch ownership. */
function cutsForOpening(
  opening: OpeningSceneNode,
  graph: PlanarGraph,
): Map<GraphEdge, EdgeOpening> {
  const cuts = new Map<GraphEdge, EdgeOpening>()
  const center = resolveOpeningEdge(opening, graph)
  if (center === null) return cuts
  const reached = new Set([center.edge])
  for (const edge of reached) {
    const a = graph.vertices[edge.a]!
    const b = graph.vertices[edge.b]!
    const length = distance(a, b)
    const positionAlongEdge = dot(subtract(opening.center, a), subtract(b, a)) / length
    const clippedEnds: number[] = []
    for (const vertex of [edge.a, edge.b]) {
      const along = vertex === edge.a ? 0 : length
      if (Math.abs(along - positionAlongEdge) >= opening.width / 2) continue
      const neighbor = graph.edges.find(
        (other) =>
          (other.a === vertex || other.b === vertex) &&
          edgeCarriesWall(other, opening.hostWallId) &&
          !sameMembership(edge, other),
      )
      if (neighbor !== undefined) {
        reached.add(neighbor)
        clippedEnds.push(along)
      }
    }
    cuts.set(edge, { opening, positionAlongEdge, clippedEnds })
  }
  return cuts
}

export function openingsByEdge(
  graph: PlanarGraph,
  openingsByWall: ReadonlyMap<string, OpeningSceneNode[]>,
): Map<GraphEdge, EdgeOpening[]> {
  const result = new Map<GraphEdge, EdgeOpening[]>()
  const wallIds = new Set(graph.edges.flatMap((edge) => [edge.wallId, ...(edge.covers ?? [])]))
  for (const wallId of wallIds) {
    for (const opening of openingsByWall.get(wallId) ?? []) {
      for (const [edge, cut] of cutsForOpening(opening, graph)) {
        const cuts = result.get(edge) ?? []
        cuts.push(cut)
        result.set(edge, cuts)
      }
    }
  }
  return result
}
