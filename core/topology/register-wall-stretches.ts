import { distance } from '../geometry/point'
import { DEFAULT_JUNCTION_TOLERANCE_MM } from '../geometry/tolerance'
import { dot, leftPerp, shift, subtract, unit } from '../geometry/vector'
import type { Point, Wall } from '../model/types'
import { nodeWallOverlaps } from './node-wall-overlaps'
import type { WallPart } from './uncovered-parts'
import type { GraphEdge } from './wall-graph'

/** The merged endpoints define the line. The bounds retain longitudinal gaps along it. */
interface RegisteredWallStretch extends WallPart {
  readonly bounds: WallPart
}

export interface WallCoverage {
  readonly owners: readonly RegisteredWallStretch[]
  readonly tolerance: number
}

function coverageBounds(authored: WallPart, merged: WallPart): WallPart {
  const direction = subtract(authored.end, authored.start)
  const normal = leftPerp(direction)
  const mergedDirection = subtract(merged.end, merged.start)
  if (
    dot(subtract(authored.start, merged.start), normal) === 0 &&
    dot(subtract(authored.end, merged.end), normal) === 0 &&
    dot(direction, mergedDirection) > 0
  )
    return authored

  // A junction can rotate this stretch. Carry only the along-wall displacement onto its new line.
  function bound(endpoint: Point, junction: Point): Point {
    const projection = dot(subtract(endpoint, junction), direction)
    if (projection === 0) return junction
    return shift(junction, unit(mergedDirection), projection / Math.hypot(direction.x, direction.y))
  }
  return { start: bound(authored.start, merged.start), end: bound(authored.end, merged.end) }
}

export function registerWallStretches(
  walls: readonly Wall[],
  tolerance = DEFAULT_JUNCTION_TOLERANCE_MM,
): {
  vertices: Point[]
  edges: GraphEdge[]
  vertexIndexFor: (point: Point) => number
  coverage: WallCoverage
} {
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

  const owners: RegisteredWallStretch[] = []
  for (const wall of walls) {
    if (distance(wall.start, wall.end) <= tolerance) continue
    const parts = nodeWallOverlaps(wall, owners, tolerance)
    parts.forEach((part) => {
      const a = vertexIndexFor(part.start)
      const b = vertexIndexFor(part.end)
      if (parts.length > 1 && a === b) return
      edges.push({ a, b, wallId: wall.id })
      if (!part.covered && a !== b) {
        const merged = { start: vertices[a] ?? part.start, end: vertices[b] ?? part.end }
        owners.push({ ...merged, bounds: coverageBounds(part, merged) })
      }
    })
  }

  return { vertices, edges, vertexIndexFor, coverage: { owners, tolerance } }
}
