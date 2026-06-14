import type { Point } from '../model/types'

import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * The plan-space footprint of one wall edge: its four ground-plane corners, two at
 * each endpoint. `aPlus` and `bPlus` sit on the edge's `+normal` (interior) side,
 * `aMinus` and `bMinus` on its `-normal` (exterior) side, where the normal is the
 * left-hand normal of the edge direction `a -> b`. A square end's corners are the
 * endpoint offset by half the wall thickness to each side.
 */
export interface WallFootprint {
  /** `+normal` side corner at endpoint `a`. */
  aPlus: Point
  /** `-normal` side corner at endpoint `a`. */
  aMinus: Point
  /** `+normal` side corner at endpoint `b`. */
  bPlus: Point
  /** `-normal` side corner at endpoint `b`. */
  bMinus: Point
}

/**
 * The plan-space footprint of every edge in a floor's wall graph, in the graph's
 * edge order. `thicknessByEdge[i]` is the thickness of the wall on edge `i`. Each
 * end is squared: its corners are the endpoint offset by half the thickness along
 * the edge's left-hand normal.
 */
export function wallFootprints(graph: PlanarGraph, thicknessByEdge: number[]): WallFootprint[] {
  return graph.edges.map((edge, index) => edgeFootprint(graph, edge, thicknessByEdge[index] ?? 0))
}

/** The footprint of one edge with both ends squared. */
function edgeFootprint(graph: PlanarGraph, edge: GraphEdge, thickness: number): WallFootprint {
  const a = graph.vertices[edge.a] as Point
  const b = graph.vertices[edge.b] as Point
  const normal = leftNormal(a, b)
  const half = thickness / 2
  return {
    aPlus: shift(a, normal, half),
    aMinus: shift(a, normal, -half),
    bPlus: shift(b, normal, half),
    bMinus: shift(b, normal, -half),
  }
}

/** Unit left-hand normal of the direction `a -> b`. */
function leftNormal(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
}

/** `point` shifted by `distance` along the unit `direction`. */
function shift(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance }
}
