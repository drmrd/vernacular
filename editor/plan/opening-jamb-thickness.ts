import { dot, subtract, type PlanarGraph, type Point } from '../../core'
import type { JambThickness } from './draw-opening'

interface WallRun {
  start: Point
  end: Point
  thickness: number
}

/** A jamb on a junction closes the run extending away from the opening at that jamb. */
export function jambThicknessFor(graph: PlanarGraph, thicknessByEdge: number[]): JambThickness {
  const runsByHost = new Map<string, WallRun[]>(
    graph.edges.flatMap((edge) => (edge.covers ?? []).map((id) => [id, []])),
  )
  for (const [index, edge] of graph.edges.entries()) {
    const run = {
      start: graph.vertices[edge.a]!,
      end: graph.vertices[edge.b]!,
      thickness: thicknessByEdge[index]!,
    }
    for (const id of [edge.wallId, ...(edge.covers ?? [])]) {
      runsByHost.get(id)?.push(run)
    }
  }
  return (node, jamb) => {
    const outward = subtract(jamb, node.center)
    let thickness = node.hostThickness
    let farthest = -Infinity
    for (const run of runsByHost.get(node.hostWallId ?? '') ?? []) {
      const a = dot(subtract(run.start, jamb), outward)
      const b = dot(subtract(run.end, jamb), outward)
      const reach = Math.max(a, b)
      if (Math.min(a, b) <= 0 && reach >= 0 && reach > farthest) {
        thickness = run.thickness
        farthest = reach
      }
    }
    return thickness
  }
}
