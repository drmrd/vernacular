import { lineIntersection } from '../geometry/segment'
import {
  directionAngle,
  dot,
  leftNormal,
  leftPerp,
  negate,
  subtract,
  unit,
} from '../geometry/vector'
import type { Point } from '../model/types'
import { signedArea } from '../scene/winding'

import type { GraphEdge, PlanarGraph } from './wall-graph'
import { type WallFootprint, vertexIncidence, wallFootprints } from './wall-footprint'

/**
 * The plan-space core a junction leaves uncovered, ready to be filled. Its `polygon`
 * is the closed ring of resolved wall-footprint corners around the junction vertex,
 * read off the same corners the walls stop at, and `edgeIndexes` lists the graph
 * edges incident to that vertex (its source walls).
 */
export interface JunctionFill {
  /** The closed ring of footprint corners enclosing the junction vertex. */
  polygon: Point[]
  /** Indices into {@link PlanarGraph.edges} of the walls meeting at the vertex. */
  edgeIndexes: number[]
}

/**
 * One incident edge as seen from a junction vertex: its outgoing unit direction from
 * the vertex, whether the vertex is the edge's `a` end, the edge's global `+normal`,
 * and the edge's index into the footprint result.
 */
interface Spoke {
  edgeIndex: number
  atA: boolean
  out: Point
  normal: Point
}

/** A junction gets a fill only where this many or more walls meet. */
const MIN_FILL_INCIDENCE = 3

/** Square millimeters below which a junction's core has collapsed to a line and gets no fill. */
const AREA_EPSILON = 1

/** Two points this close together count as the same footprint corner. */
const CORNER_EPSILON = 1e-6

/**
 * The plan-view fill polygon for every junction where three or more walls meet whose
 * uncovered core has area, read from the resolved corners the walls stop at. A free
 * end and a two-way corner yield no fill (the wall prisms already join those solid).
 * `thicknessByEdge[i]` is the thickness of the wall on edge `i`. The polygon's points
 * are read from `wallFootprints`, so the fill abuts each wall along its near edge.
 */
export function junctionFills(graph: PlanarGraph, thicknessByEdge: number[]): JunctionFill[] {
  const context: FillContext = { graph, footprints: wallFootprints(graph, thicknessByEdge) }
  const fills: JunctionFill[] = []
  for (const [vertexIndex, edgeIndexes] of vertexIncidence(graph)) {
    if (edgeIndexes.length < MIN_FILL_INCIDENCE) continue
    const polygon = corePolygon(context, vertexIndex, edgeIndexes)
    if (Math.abs(signedArea(polygon)) > AREA_EPSILON) fills.push({ polygon, edgeIndexes })
  }
  return fills
}

/** Per-call lookups shared while reading every junction's core polygon. */
interface FillContext {
  graph: PlanarGraph
  footprints: WallFootprint[]
}

/**
 * The uncovered core ring around a junction vertex: sort its incident spokes in
 * counter-clockwise fan order, read each wall's near edge (cap) at the vertex, then
 * cross each adjacent pair of cap lines. For a clean wedge this crossing is the walls'
 * shared miter; for an acute wedge where the walls overlap it is the near-vertex
 * crossing, so the ring stays simple with one vertex per incident wall.
 */
function corePolygon(context: FillContext, vertexIndex: number, edgeIndexes: number[]): Point[] {
  const spokes = edgeIndexes.map((edgeIndex) => spokeAt(context.graph, edgeIndex, vertexIndex))
  spokes.sort((left, right) => directionAngle(left.out) - directionAngle(right.out))
  const caps = spokes.map((spoke) =>
    wallCap(context.footprints[spoke.edgeIndex] as WallFootprint, spoke),
  )
  const polygon = caps.map((cap, index) =>
    capCrossing(cap, caps[(index + 1) % caps.length] as WallCap),
  )
  return dedupeAdjacent(polygon)
}

/**
 * A wall's near edge at a junction vertex: the footprint corners on the spoke's
 * counter-clockwise (`+leftPerp(spoke.out)`) and clockwise (`-leftPerp(spoke.out)`) sides.
 */
interface WallCap {
  ccwCorner: Point
  cwCorner: Point
}

/** Read a wall's near edge at the vertex from its footprint corners on each side. */
function wallCap(footprint: WallFootprint, spoke: Spoke): WallCap {
  return {
    ccwCorner: cornerOf(footprint, spoke, leftPerp(spoke.out)),
    cwCorner: cornerOf(footprint, spoke, negate(leftPerp(spoke.out))),
  }
}

/**
 * Where the cap lines of two angularly-adjacent spokes cross, with `a` the
 * counter-clockwise-earlier spoke and `b` its counter-clockwise neighbor: the shared
 * miter for a clean wedge, the near-vertex crossing for an acute overlapping wedge.
 * A very wide wedge between two nearly-collinear walls (close to 180 degrees) yields a
 * crossing far from the vertex; that case is not guarded here and is deferred to a
 * follow-up that tightens it. The common wedges (clean miters and acute overlaps) cross
 * near the vertex.
 *
 * If the two cap lines are parallel (collinear walls, no crossing), fall back to the
 * midpoint of the two corners that bound this wedge: `a`'s counter-clockwise-side corner
 * and `b`'s clockwise-side corner.
 */
function capCrossing(a: WallCap, b: WallCap): Point {
  const crossing = lineIntersection(
    a.ccwCorner,
    subtract(a.cwCorner, a.ccwCorner),
    b.ccwCorner,
    subtract(b.cwCorner, b.ccwCorner),
  )
  return crossing ?? midpoint(a.ccwCorner, b.cwCorner)
}

/** The midpoint of `p` and `q`. */
function midpoint(p: Point, q: Point): Point {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
}

/** Build one spoke: the edge's outgoing direction from the vertex and its global normal. */
function spokeAt(graph: PlanarGraph, edgeIndex: number, vertexIndex: number): Spoke {
  const edge = graph.edges[edgeIndex] as GraphEdge
  const atA = edge.a === vertexIndex
  const vertex = graph.vertices[vertexIndex] as Point
  const far = graph.vertices[atA ? edge.b : edge.a] as Point
  // `a` and `b` are the edge's canonical endpoints, fixing the global `leftNormal(a, b)`.
  const a = graph.vertices[edge.a] as Point
  const b = graph.vertices[edge.b] as Point
  return { edgeIndex, atA, out: unit(subtract(far, vertex)), normal: leftNormal(a, b) }
}

/**
 * Read the footprint corner on the side `sideDir` selects: whichever of the spoke's
 * `+normal`/`-normal` corners at its vertex end lies on that side. This inverts the
 * footprint pass's corner assignment, so the fill reads the corners the walls committed.
 */
function cornerOf(footprint: WallFootprint, spoke: Spoke, sideDir: Point): Point {
  const isPlus = dot(sideDir, spoke.normal) > 0
  if (spoke.atA) return isPlus ? footprint.aPlus : footprint.aMinus
  return isPlus ? footprint.bPlus : footprint.bMinus
}

/** Drop each point equal (within epsilon) to the one before it, and the last if it equals the first. */
function dedupeAdjacent(points: Point[]): Point[] {
  const deduped: Point[] = []
  for (const point of points) {
    const previous = deduped[deduped.length - 1]
    if (previous === undefined || !samePoint(previous, point)) deduped.push(point)
  }
  const first = deduped[0]
  const last = deduped[deduped.length - 1]
  if (deduped.length > 1 && first !== undefined && last !== undefined && samePoint(first, last)) {
    deduped.pop()
  }
  return deduped
}

/** Whether two points are the same footprint corner, within epsilon. */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < CORNER_EPSILON && Math.abs(a.y - b.y) < CORNER_EPSILON
}
