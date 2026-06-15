import { distance } from '../geometry/point'
import { lineIntersection } from '../geometry/segment'
import { dot, leftNormal, leftPerp, shift, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'

import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * The plan-space footprint of one wall edge: its four ground-plane corners, two at
 * each endpoint. `aPlus` and `bPlus` sit on the edge's `+normal` (interior) side,
 * `aMinus` and `bMinus` on its `-normal` (exterior) side, where the normal is the
 * left-hand normal of the edge direction `a -> b`. A square end's corners are the
 * endpoint offset by half the wall thickness to each side; a mitered end's corners
 * are where this edge's face lines cross its neighbor's in the junction fan.
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
 * One edge as seen from a junction vertex: its outgoing unit direction from the
 * vertex, its half-thickness, whether the vertex is the edge's `a` end, the edge's
 * global `+normal`, and the edge's index into the footprint result.
 */
interface Spoke {
  edgeIndex: number
  atA: boolean
  out: Point
  half: number
  normal: Point
}

/** The open ground between a spoke and its counter-clockwise neighbor at a vertex. */
interface Wedge {
  vertex: Point
  spoke: Spoke
  neighbor: Spoke
}

/** Per-call lookups shared while resolving every junction fan into footprints. */
interface FanContext {
  graph: PlanarGraph
  thicknessByEdge: number[]
  result: WallFootprint[]
}

/**
 * A miter that would reach past this multiple of the wall's half-thickness comes
 * from a corner too acute to cut cleanly, so the end falls back to a square cap
 * rather than draw a long spike.
 */
export const MITER_LIMIT = 4

/**
 * The plan-space footprint of every edge in a floor's wall graph, in the graph's
 * edge order. `thicknessByEdge[i]` is the thickness of the wall on edge `i`. Each
 * junction vertex is resolved as a fan of its incident edges, sharing one miter
 * point per wedge between angular neighbors so the walls tile the joint at any
 * incidence; a free end, a collinear continuation, and an over-limit acute wedge
 * fall back to each wall's own square face-offset point.
 */
export function wallFootprints(graph: PlanarGraph, thicknessByEdge: number[]): WallFootprint[] {
  const result = graph.edges.map((edge, index) =>
    squareFootprint(graph, edge, thicknessByEdge[index] ?? 0),
  )
  const context: FanContext = { graph, thicknessByEdge, result }
  for (const [vertexIndex, edgeIndexes] of vertexIncidence(graph)) {
    resolveVertex(context, vertexIndex, edgeIndexes)
  }
  return result
}

/** The square footprint: each endpoint offset by half the thickness to both sides. */
function squareFootprint(graph: PlanarGraph, edge: GraphEdge, thickness: number): WallFootprint {
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

/**
 * Resolve one vertex's fan, writing each incident edge's corners at the vertex into
 * `context.result`. A vertex with fewer than two incident edges keeps its square
 * default. The spokes are sorted counter-clockwise so each pairs with its neighbor.
 */
function resolveVertex(context: FanContext, vertexIndex: number, edgeIndexes: number[]): void {
  if (edgeIndexes.length < 2) return
  const vertex = context.graph.vertices[vertexIndex] as Point
  const spokes = buildSpokes(context, vertexIndex, edgeIndexes)
  spokes.sort((left, right) => spokeAngle(left) - spokeAngle(right))
  for (const [index, spoke] of spokes.entries()) {
    const neighbor = spokes[(index + 1) % spokes.length] as Spoke
    resolveWedge(context.result, { vertex, spoke, neighbor })
  }
}

/** The counter-clockwise angle of a spoke's outgoing direction. */
function spokeAngle(spoke: Spoke): number {
  return Math.atan2(spoke.out.y, spoke.out.x)
}

/** The spokes of a vertex: one per incident edge, leaving the vertex outward. */
function buildSpokes(context: FanContext, vertexIndex: number, edgeIndexes: number[]): Spoke[] {
  const vertex = context.graph.vertices[vertexIndex] as Point
  return edgeIndexes.map((edgeIndex) => {
    const edge = context.graph.edges[edgeIndex] as GraphEdge
    const atA = edge.a === vertexIndex
    const far = context.graph.vertices[atA ? edge.b : edge.a] as Point
    // `a` and `b` are the edge's canonical endpoints, fixing the global `leftNormal(a, b)`
    // direction; `vertex`/`far` are the same two points ordered from this junction outward.
    const a = context.graph.vertices[edge.a] as Point
    const b = context.graph.vertices[edge.b] as Point
    return {
      edgeIndex,
      atA,
      out: unit(subtract(far, vertex)),
      half: (context.thicknessByEdge[edgeIndex] ?? 0) / 2,
      normal: leftNormal(a, b),
    }
  })
}

/**
 * Resolve a wedge: the shared miter point of its two bordering face lines, or each
 * wall's own face-offset point when the faces are parallel (collinear) or the miter
 * runs past the limit. The miter is the crossing of the counter-clockwise spoke's
 * `+leftPerp` face and the clockwise neighbor's `-leftPerp` face.
 */
function resolveWedge(result: WallFootprint[], wedge: Wedge): void {
  const spokeSide = leftPerp(wedge.spoke.out)
  const neighborSide = leftPerp(wedge.neighbor.out)
  const spokeFace = shift(wedge.vertex, spokeSide, wedge.spoke.half)
  const neighborFace = shift(wedge.vertex, neighborSide, -wedge.neighbor.half)
  const miter = lineIntersection(spokeFace, wedge.spoke.out, neighborFace, wedge.neighbor.out)
  const shared = sharedMiterPoint(wedge, miter)
  assignCorner(result, wedge.spoke, {
    sideDir: spokeSide,
    point: shared ?? spokeFace,
  })
  assignCorner(result, wedge.neighbor, {
    sideDir: negate(neighborSide),
    point: shared ?? neighborFace,
  })
}

/** The wedge's shared miter point when it is non-null and within the miter limit, else null. */
function sharedMiterPoint(wedge: Wedge, miter: Point | null): Point | null {
  if (miter === null) return null
  const limit = MITER_LIMIT * Math.min(wedge.spoke.half, wedge.neighbor.half)
  if (distance(wedge.vertex, miter) > limit) return null
  return miter
}

/** A corner to write: the side direction that selects `+normal`/`-normal`, and its point. */
interface CornerTarget {
  sideDir: Point
  point: Point
}

/** Write `target.point` to the spoke's corner on the side `target.sideDir` selects. */
function assignCorner(result: WallFootprint[], spoke: Spoke, target: CornerTarget): void {
  const footprint = result[spoke.edgeIndex] as WallFootprint
  const isPlus = dot(target.sideDir, spoke.normal) > 0
  if (spoke.atA) {
    if (isPlus) footprint.aPlus = target.point
    else footprint.aMinus = target.point
    return
  }
  if (isPlus) footprint.bPlus = target.point
  else footprint.bMinus = target.point
}

/** The opposite direction. */
function negate(vector: Point): Point {
  return { x: -vector.x, y: -vector.y }
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
