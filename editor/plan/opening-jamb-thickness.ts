import {
  ANGLE_TOLERANCE_RAD,
  distance,
  dot,
  leftPerp,
  LENGTH_TOLERANCE_MM,
  subtract,
  unit,
  type PlanarGraph,
  type Point,
} from '../../core'
import type { JambThickness } from './draw-opening'

interface WallRun {
  start: Point
  end: Point
  thickness: number
  shared: boolean
}

function overlapJunction(runs: readonly WallRun[], jamb: Point): Point | undefined {
  return runs
    .filter((run) => run.shared)
    .flatMap((run) => [run.start, run.end])
    .find((vertex) => distance(vertex, jamb) <= LENGTH_TOLERANCE_MM)
}

function continuingRun(
  runs: readonly WallRun[],
  junction: Point,
  outward: Point,
): WallRun | undefined {
  const direction = unit(outward)
  const normal = leftPerp(direction)
  return runs.find((run) => {
    if (run.start !== junction && run.end !== junction) return false
    const far = run.start === junction ? run.end : run.start
    const along = unit(subtract(far, junction))
    return dot(along, direction) > 0 && Math.abs(dot(along, normal)) <= ANGLE_TOLERANCE_RAD
  })
}

/** A jamb on a junction closes the run extending away from the opening at that jamb. */
export function jambThicknessFor(graph: PlanarGraph, thicknessByEdge: number[]): JambThickness {
  const runsByHost = new Map<string, WallRun[]>(
    graph.edges.flatMap(({ wallId, covers }) =>
      covers === undefined ? [] : [wallId, ...covers].map((id) => [id, []]),
    ),
  )
  const runs = graph.edges.map((edge, index) => {
    const run = {
      start: graph.vertices[edge.a]!,
      end: graph.vertices[edge.b]!,
      thickness: thicknessByEdge[index]!,
      shared: edge.covers !== undefined,
    }
    for (const id of [edge.wallId, ...(edge.covers ?? [])]) {
      runsByHost.get(id)?.push(run)
    }
    return run
  })
  return (node, jamb) => {
    const outward = subtract(jamb, node.center)
    const hostRuns = runsByHost.get(node.hostWallId ?? '') ?? []
    const junction = overlapJunction(hostRuns, jamb)
    const continuation = junction === undefined ? undefined : continuingRun(runs, junction, outward)
    if (continuation !== undefined) return continuation.thickness

    let thickness = node.hostThickness
    let farthest = -Infinity
    for (const run of hostRuns) {
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
