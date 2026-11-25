import { directionAngle, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'

import type { GraphEdge, PlanarGraph } from './wall-graph'

/** Junction to its incident edge indexes, counterclockwise by leaving angle. */
export type JunctionFans = ReadonlyMap<number, readonly number[]>

/** Optional input of the functions that read junction fans: fans already ordered counterclockwise. */
export interface FanOptions {
  readonly fans?: JunctionFans
}

let fanBuilds = 0

/** How many times `junctionFans` has run, for tests that expect one build per wall network. */
export function junctionFanBuildCount(): number {
  return fanBuilds
}

/** Each junction's incident edge indexes, counterclockwise by leaving angle. */
export function junctionFans(graph: PlanarGraph): JunctionFans {
  fanBuilds += 1
  const fans = new Map<number, readonly number[]>()
  for (const [junction, edgeIndexes] of vertexIncidence(graph)) {
    fans.set(junction, edgesCounterclockwise(graph, junction, edgeIndexes))
  }
  return fans
}

/** Maps each graph vertex to the indices of the edges incident to it. */
export function vertexIncidence(graph: PlanarGraph): Map<number, number[]> {
  const incidence = new Map<number, number[]>()
  for (const [index, edge] of graph.edges.entries()) {
    pushIncident(incidence, edge.a, index)
    pushIncident(incidence, edge.b, index)
  }
  return incidence
}

/** Records `edgeIndex` against the vertex it touches, building the incidence map. */
function pushIncident(
  incidence: Map<number, number[]>,
  vertexIndex: number,
  edgeIndex: number,
): void {
  const list = incidence.get(vertexIndex) ?? []
  list.push(edgeIndex)
  incidence.set(vertexIndex, list)
}

/** The edges ascending by the angle at which each leaves the junction. */
function edgesCounterclockwise(
  graph: PlanarGraph,
  junction: number,
  edgeIndexes: readonly number[],
): number[] {
  const angleOf = (edgeIndex: number): number =>
    directionAngle(leavingDirection(graph, junction, edgeIndex))
  return [...edgeIndexes].sort((left, right) => angleOf(left) - angleOf(right))
}

/** The unit direction in which an edge leaves a junction. */
function leavingDirection(graph: PlanarGraph, junction: number, edgeIndex: number): Point {
  const edge = graph.edges[edgeIndex] as GraphEdge
  const far = graph.vertices[edge.a === junction ? edge.b : edge.a] as Point
  return unit(subtract(far, graph.vertices[junction] as Point))
}
