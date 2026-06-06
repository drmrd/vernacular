import { polygonArea } from '../geometry/polygon'
import type { Point, Wall } from '../model/types'
import { buildWallGraph } from './wall-graph'

/** A bounded region of floor enclosed by walls, derived from the wall topology. */
export interface Room {
  /** Stable identifier built from the sorted ids of the walls that enclose the room. */
  id: string
  /** Corner points of the room boundary, in floor-plan space. */
  polygon: Point[]
  /** Signed area of the room polygon, in squared millimeters. */
  area: number
  /** Sorted, unique ids of the walls that enclose the room. */
  wallIds: string[]
}

/**
 * Smallest positive area, in squared millimeters, that a traced face must exceed
 * to count as a room. Filters out the single negative-area outer (unbounded)
 * face produced by the half-edge walk.
 */
const MIN_ROOM_AREA = 1

/** A directed half of an undirected graph edge, carrying its source wall's id. */
interface HalfEdge {
  /** Index into the graph's vertices of the half-edge's tail. */
  from: number
  /** Index into the graph's vertices of the half-edge's head. */
  to: number
  /** The id of the wall this half-edge was derived from. */
  wallId: string
}

/**
 * Derive rooms from a set of walls by enumerating the bounded faces of the wall
 * graph. See the design specification, section 3.2 ("Rooms are derived from wall
 * topology"). Each closed loop of walls becomes one room.
 */
export function deriveRooms(walls: readonly Wall[], options?: { tolerance?: number }): Room[] {
  const graph = buildWallGraph(walls, options)
  const halfEdges = buildHalfEdges(graph.edges)
  const faces = enumerateFaces(halfEdges, graph.vertices)

  const rooms: Room[] = []
  for (const face of faces) {
    const polygon = facePolygon(face, graph.vertices)
    const area = polygonArea(polygon)
    if (area <= MIN_ROOM_AREA) continue
    const wallIds = sortedUniqueWallIds(face)
    rooms.push({ id: `room:${wallIds.join('-')}`, polygon, area, wallIds })
  }
  return rooms
}

/** Emit two directed half-edges, one in each direction, for every undirected edge. */
function buildHalfEdges(edges: readonly { a: number; b: number; wallId: string }[]): HalfEdge[] {
  const halfEdges: HalfEdge[] = []
  for (const edge of edges) {
    halfEdges.push({ from: edge.a, to: edge.b, wallId: edge.wallId })
    halfEdges.push({ from: edge.b, to: edge.a, wallId: edge.wallId })
  }
  return halfEdges
}

/**
 * Group half-edge indices by their tail vertex, each group sorted ascending by
 * the half-edge's outgoing direction angle.
 */
function outgoingByVertex(
  halfEdges: readonly HalfEdge[],
  vertices: readonly Point[],
): Map<number, number[]> {
  const outgoing = new Map<number, number[]>()
  for (const [index, half] of halfEdges.entries()) {
    const group = outgoing.get(half.from) ?? []
    group.push(index)
    outgoing.set(half.from, group)
  }
  for (const group of outgoing.values()) {
    group.sort(
      (left, right) =>
        halfEdgeAngle(halfEdges, left, vertices) - halfEdgeAngle(halfEdges, right, vertices),
    )
  }
  return outgoing
}

/** Direction angle of a half-edge measured from its tail to its head. */
function halfEdgeAngle(
  halfEdges: readonly HalfEdge[],
  index: number,
  vertices: readonly Point[],
): number {
  const half = halfEdges[index]
  if (half === undefined) return 0
  const from = vertices[half.from]
  const to = vertices[half.to]
  if (from === undefined || to === undefined) return 0
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/** Shared state for a single pass of face tracing over a half-edge graph. */
interface FaceWalk {
  halfEdges: readonly HalfEdge[]
  outgoing: ReadonlyMap<number, number[]>
  visited: Set<number>
}

/**
 * Trace every face of the half-edge graph. From each unvisited half-edge, follow
 * the clockwise-previous-of-the-twin successor until the walk returns to its
 * start; each closed walk is one face.
 */
function enumerateFaces(halfEdges: readonly HalfEdge[], vertices: readonly Point[]): HalfEdge[][] {
  const walk: FaceWalk = {
    halfEdges,
    outgoing: outgoingByVertex(halfEdges, vertices),
    visited: new Set<number>(),
  }
  const faces: HalfEdge[][] = []

  for (const start of halfEdges.keys()) {
    if (walk.visited.has(start)) continue
    faces.push(traceFace(start, walk))
  }
  return faces
}

/** Walk one face starting from a half-edge index, marking each visited half-edge. */
function traceFace(start: number, walk: FaceWalk): HalfEdge[] {
  const face: HalfEdge[] = []
  let current = start
  do {
    walk.visited.add(current)
    const half = walk.halfEdges[current]
    if (half === undefined) break
    face.push(half)
    current = nextHalfEdge(current, walk.halfEdges, walk.outgoing)
  } while (current !== start)
  return face
}

/**
 * The successor of a half-edge in a face walk: the half-edge immediately before
 * this one's twin, cyclically, in the angle-sorted outgoing list at the head.
 */
function nextHalfEdge(
  index: number,
  halfEdges: readonly HalfEdge[],
  outgoing: ReadonlyMap<number, number[]>,
): number {
  const half = halfEdges[index]
  if (half === undefined) return index
  const group = outgoing.get(half.to)
  if (group === undefined) return index
  const twin = group.findIndex((candidate) => {
    const other = halfEdges[candidate]
    return other !== undefined && other.to === half.from && other.wallId === half.wallId
  })
  if (twin === -1) return index
  const previous = group[(twin - 1 + group.length) % group.length]
  return previous ?? index
}

/** Build a polygon from the tail vertices of a face's half-edges. */
function facePolygon(face: readonly HalfEdge[], vertices: readonly Point[]): Point[] {
  const polygon: Point[] = []
  for (const half of face) {
    const vertex = vertices[half.from]
    if (vertex !== undefined) polygon.push(vertex)
  }
  return polygon
}

/** Sorted, unique wall ids of a face's half-edges. */
function sortedUniqueWallIds(face: readonly HalfEdge[]): string[] {
  return [...new Set(face.map((half) => half.wallId))].sort()
}
