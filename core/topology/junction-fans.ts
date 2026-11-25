import { directionAngle, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'

import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * Junction to its incident edge indexes, counterclockwise by leaving angle. An edge from a
 * junction to itself is left out.
 */
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

/**
 * Each junction's incident edge indexes, counterclockwise by leaving angle. An edge from a
 * junction to itself is left out, so a junction whose only other edge is such a loop gets an
 * empty fan.
 */
export function junctionFans(graph: PlanarGraph): JunctionFans {
  fanBuilds += 1
  const fans = new Map<number, readonly number[]>()
  for (const [junction, edgeIndexes] of incidentEdgesWithoutLoops(graph)) {
    fans.set(junction, edgesCounterclockwise(graph, junction, edgeIndexes))
  }
  return fans
}

/**
 * Maps each graph vertex to the indices of the edges incident to it. An edge from a junction to
 * itself is listed once, unlike in the fans, which leave it out.
 */
export function vertexIncidence(graph: PlanarGraph): Map<number, number[]> {
  const incidence = new Map<number, number[]>()
  for (const [index, edge] of graph.edges.entries()) {
    pushIncident(incidence, edge.a, index)
    if (!isSelfLoop(edge)) pushIncident(incidence, edge.b, index)
  }
  return incidence
}

/**
 * Each graph vertex's incident edge indexes in ascending order, with every edge from a junction to
 * itself left out. The junction fans and the junction fade groups both read this set.
 */
export function incidentEdgesWithoutLoops(graph: PlanarGraph): Map<number, number[]> {
  const withoutLoops = new Map<number, number[]>()
  for (const [junction, edgeIndexes] of vertexIncidence(graph)) {
    withoutLoops.set(
      junction,
      edgeIndexes.filter((edgeIndex) => !isSelfLoop(graph.edges[edgeIndex] as GraphEdge)),
    )
  }
  return withoutLoops
}

/** True for an edge whose two ends merged into one junction. */
export function isSelfLoop(edge: Pick<GraphEdge, 'a' | 'b'>): boolean {
  return edge.a === edge.b
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
