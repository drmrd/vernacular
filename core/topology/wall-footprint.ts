import { distance } from '../geometry/point'
import { lineIntersection } from '../geometry/segment'
import type { Point } from '../model/types'

import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * The plan-space footprint of one wall edge: its four ground-plane corners, two at
 * each endpoint. `aPlus` and `bPlus` sit on the edge's `+normal` (interior) side,
 * `aMinus` and `bMinus` on its `-normal` (exterior) side, where the normal is the
 * left-hand normal of the edge direction `a -> b`. A square end's corners are the
 * endpoint offset by half the wall thickness to each side; a mitered end's corners
 * are where this edge's face lines cross its neighbor's at a two-way corner.
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

/** The two corners of one wall end, on the `+normal` and `-normal` sides. */
interface EndCorners {
  plus: Point
  minus: Point
}

/** One wall end: where it sits, which way the wall runs, and the edge's normal. */
interface EdgeEnd {
  vertexIndex: number
  point: Point
  far: Point
  normal: Point
  half: number
}

/** The neighbor a two-way corner miters against: its far point and half-thickness. */
interface Neighbor {
  far: Point
  half: number
}

/** One wall's face line at the shared vertex: its direction and half-thickness. */
interface WallRay {
  direction: Point
  half: number
}

/** The two walls meeting at a corner, as a directed pair: out along this edge,
 *  in along the neighbor. */
interface MiterRays {
  out: WallRay
  incoming: WallRay
}

/** Per-call lookups shared across every edge's footprint. */
interface FootprintContext {
  graph: PlanarGraph
  thicknessByEdge: number[]
  incidence: Map<number, number[]>
}

/**
 * A miter that would reach past this multiple of the wall's half-thickness comes
 * from a corner too acute to cut cleanly, so the end falls back to a square cap
 * rather than draw a long spike.
 */
export const MITER_LIMIT = 4

/**
 * The plan-space footprint of every edge in a floor's wall graph, in the graph's
 * edge order. `thicknessByEdge[i]` is the thickness of the wall on edge `i`. An
 * end where exactly two edges meet is mitered to the corner; a free end, a busier
 * junction (three or more incident edges), or a collinear continuation is squared.
 */
export function wallFootprints(graph: PlanarGraph, thicknessByEdge: number[]): WallFootprint[] {
  const context: FootprintContext = { graph, thicknessByEdge, incidence: vertexIncidence(graph) }
  return graph.edges.map((_edge, index) => edgeFootprint(context, index))
}

/** The footprint of one edge, each end squared or mitered. */
function edgeFootprint(context: FootprintContext, edgeIndex: number): WallFootprint {
  const edge = context.graph.edges[edgeIndex] as GraphEdge
  const a = context.graph.vertices[edge.a] as Point
  const b = context.graph.vertices[edge.b] as Point
  const normal = leftNormal(a, b)
  const half = (context.thicknessByEdge[edgeIndex] ?? 0) / 2
  const aEnd = endCorners(context, edgeIndex, {
    vertexIndex: edge.a,
    point: a,
    far: b,
    normal,
    half,
  })
  const bEnd = endCorners(context, edgeIndex, {
    vertexIndex: edge.b,
    point: b,
    far: a,
    normal,
    half,
  })
  return { aPlus: aEnd.plus, aMinus: aEnd.minus, bPlus: bEnd.plus, bMinus: bEnd.minus }
}

/** The corners of one end: the miter at a two-way corner, otherwise a square cap. */
function endCorners(context: FootprintContext, edgeIndex: number, end: EdgeEnd): EndCorners {
  const neighbor = neighborAt(context, edgeIndex, end.vertexIndex)
  if (neighbor !== null) {
    const mitered = miterCorners(end, neighbor)
    if (mitered !== null) return mitered
  }
  return squareCorners(end)
}

/** The square cap: the end offset by half the thickness to each side. */
function squareCorners(end: EdgeEnd): EndCorners {
  return {
    plus: shift(end.point, end.normal, end.half),
    minus: shift(end.point, end.normal, -end.half),
  }
}

/**
 * The two miter corners, or null when the walls are parallel (collinear) so their
 * face lines never cross. The corner is read from a directed walk that comes in
 * along the neighbor to the shared vertex and goes out along this edge; the walk's
 * left and right miters map to this edge's `+normal` / `-normal` sides by the sign
 * of the outgoing direction's left perpendicular against the edge normal.
 */
function miterCorners(end: EdgeEnd, neighbor: Neighbor): EndCorners | null {
  const rays: MiterRays = {
    out: { direction: unit(subtract(end.far, end.point)), half: end.half },
    incoming: { direction: unit(subtract(end.point, neighbor.far)), half: neighbor.half },
  }
  const left = faceCrossing(end.point, rays, 1)
  const right = faceCrossing(end.point, rays, -1)
  if (left === null || right === null) return null
  if (overMiterLimit(end, left) || overMiterLimit(end, right)) return null
  return dot(leftPerp(rays.out.direction), end.normal) > 0
    ? { plus: left, minus: right }
    : { plus: right, minus: left }
}

/** Whether a miter corner reaches past the miter limit from the shared vertex. */
function overMiterLimit(end: EdgeEnd, corner: Point): boolean {
  return distance(end.point, corner) > MITER_LIMIT * end.half
}

/**
 * The crossing of this edge's and the neighbor's face lines on one side: `side` is
 * `+1` for each wall's left face line and `-1` for its right, each offset from the
 * shared vertex by that wall's own half-thickness so the joint is correct for
 * different thicknesses.
 */
function faceCrossing(vertex: Point, rays: MiterRays, side: number): Point | null {
  return lineIntersection(
    shift(vertex, leftPerp(rays.out.direction), side * rays.out.half),
    rays.out.direction,
    shift(vertex, leftPerp(rays.incoming.direction), side * rays.incoming.half),
    rays.incoming.direction,
  )
}

/** The neighbor at a vertex with exactly two incident edges, else null. */
function neighborAt(
  context: FootprintContext,
  edgeIndex: number,
  vertexIndex: number,
): Neighbor | null {
  const incident = context.incidence.get(vertexIndex) ?? []
  if (incident.length !== 2) return null
  const otherIndex = incident[0] === edgeIndex ? incident[1] : incident[0]
  if (otherIndex === undefined) return null
  const other = context.graph.edges[otherIndex]
  if (other === undefined) return null
  const far = context.graph.vertices[other.a === vertexIndex ? other.b : other.a]
  if (far === undefined) return null
  return { far, half: (context.thicknessByEdge[otherIndex] ?? 0) / 2 }
}

/** Maps each graph vertex to the indices of the edges incident to it. */
function vertexIncidence(graph: PlanarGraph): Map<number, number[]> {
  const incidence = new Map<number, number[]>()
  graph.edges.forEach((edge, index) => {
    pushIncident(incidence, edge.a, index)
    pushIncident(incidence, edge.b, index)
  })
  return incidence
}

function pushIncident(
  incidence: Map<number, number[]>,
  vertexIndex: number,
  edgeIndex: number,
): void {
  const list = incidence.get(vertexIndex) ?? []
  list.push(edgeIndex)
  incidence.set(vertexIndex, list)
}

/** Unit left-hand normal of the direction `a -> b`. */
function leftNormal(a: Point, b: Point): Point {
  return leftPerp(unit(subtract(b, a)))
}

/** `from - to`, component-wise. */
function subtract(from: Point, to: Point): Point {
  return { x: from.x - to.x, y: from.y - to.y }
}

/** `vector` scaled to unit length. */
function unit(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y)
  return { x: vector.x / length, y: vector.y / length }
}

/** The left-hand perpendicular of `vector`. */
function leftPerp(vector: Point): Point {
  return { x: -vector.y, y: vector.x }
}

/** The dot product of `a` and `b`. */
function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

/** `point` shifted by `distance` along `direction`. */
function shift(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance }
}
