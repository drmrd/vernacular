import { insetPolygon, outsetPolygon, polygonArea } from '../geometry/polygon'
import { MIN_FACE_AREA_MM2 } from '../geometry/tolerance'
import type { Point } from '../model/types'
import type { JunctionFans } from './junction-fans'
import { assignHoles, immediateContainer } from './room-holes'
import { ROOM_ID_PREFIX, roomKey } from './room-key'
import type { Room } from './rooms'
import type { GraphEdge, PlanarGraph } from './wall-graph'

/**
 * Wall thickness, in millimeters, assumed for a face edge whose host wall is
 * missing from the thickness map. Faces only ever reference real walls, so this
 * is a defensive fallback that should never be reached in practice.
 */
const DEFAULT_WALL_THICKNESS = 0

/** A directed half of an undirected graph edge, carrying its source wall's id. */
interface HalfEdge {
  /** Position of this half-edge in the walk's half-edge list (see {@link halfEdgeFromA}). */
  index: number
  /** Index into the graph's vertices of the half-edge's tail. */
  from: number
  /** Index into the graph's vertices of the half-edge's head. */
  to: number
  /** The id of the wall this half-edge was derived from. */
  wallId: string
}

/** The indexes into a walk's rooms of the room on each side of one graph edge, if any. */
export interface EdgeSideRooms {
  /** The room to the left of the edge from its `a` end to its `b` end. */
  readonly left: number | undefined
  /** The room to the right of the edge from its `a` end to its `b` end. */
  readonly right: number | undefined
}

/** The rooms of a wall graph and the room that the face walk found on each side of each edge. */
export interface RoomWalk {
  readonly rooms: Room[]
  /** By graph edge index: the room on each side of the edge. */
  readonly roomsBesideEdge: readonly EdgeSideRooms[]
}

/**
 * Derive rooms from a prepared wall graph by enumerating its bounded faces. See the
 * design specification, section 3.2 ("Rooms are derived from wall topology"). Each
 * closed loop of walls becomes one room.
 */
export function roomsOfGraph(
  graph: PlanarGraph,
  thicknessByWallId: ReadonlyMap<string, number>,
  fans: JunctionFans,
): RoomWalk {
  const halfEdges = buildHalfEdges(graph.edges)
  const faces = enumerateFaces(halfEdges, outgoingFromFans(graph, fans))
  const faceOfHalfEdge = facesByHalfEdge(faces)

  const boundaries = faces.map((face) =>
    faceBoundary(face, graph.vertices, { thicknessByWallId, faceOfHalfEdge }),
  )
  const { rooms, roomOfFace } = roomsOfFaces(boundaries)
  const containerOfRoom = rooms.map((inner) => immediateContainer(inner, rooms))
  const roomOfHalfEdge = roomOfEachHalfEdge({
    outlineFaceOfHalfEdge: outlineFacesOf(boundaries, halfEdges.length),
    roomOfFace,
    containerOfRoom,
  })
  return {
    rooms: assignHoles(rooms, containerOfRoom),
    roomsBesideEdge: graph.edges.map((_edge, edgeIndex) => ({
      left: roomOfHalfEdge[halfEdgeFromA(edgeIndex)],
      right: roomOfHalfEdge[halfEdgeFromB(edgeIndex)],
    })),
  }
}

/**
 * The rooms that the faces became, and the index of each kept face's room. A face becomes a room
 * when its centerline polygon clears the minimum area; the negative-area outer (unbounded) face is
 * excluded. An edge is shared when its twin belongs to one of these kept room faces.
 */
function roomsOfFaces(boundaries: readonly FaceBoundary[]): {
  rooms: Room[]
  roomOfFace: Map<number, number>
} {
  const roomFaces = new Set<number>()
  boundaries.forEach((boundary, index) => {
    if (polygonArea(boundary.polygon) > MIN_FACE_AREA_MM2) roomFaces.add(index)
  })
  const rooms: Room[] = []
  const roomOfFace = new Map<number, number>()
  for (const faceIndex of roomFaces) {
    const boundary = boundaries[faceIndex]
    if (boundary === undefined) continue
    roomOfFace.set(faceIndex, rooms.length)
    rooms.push(buildRoom(boundary, roomFaces))
  }
  return { rooms, roomOfFace }
}

/**
 * By half-edge index: the face whose outline holds it. Undefined when no face walks it or the
 * spike removal dropped it.
 */
function outlineFacesOf(
  boundaries: readonly FaceBoundary[],
  halfEdgeCount: number,
): (number | undefined)[] {
  const outlineFaceOfHalfEdge = new Array<number | undefined>(halfEdgeCount).fill(undefined)
  boundaries.forEach((boundary, faceIndex) => {
    for (const halfEdge of boundary.outline) outlineFaceOfHalfEdge[halfEdge] = faceIndex
  })
  return outlineFaceOfHalfEdge
}

/** What the walk found on the way to the room along each half-edge. */
interface WalkedFaces {
  /** By half-edge index: the face whose outline holds it. */
  readonly outlineFaceOfHalfEdge: readonly (number | undefined)[]
  /** The index of the room that each kept face became, by face index. */
  readonly roomOfFace: ReadonlyMap<number, number>
  /** By room index: the index of the room that the hole pass gave it to as a hole. */
  readonly containerOfRoom: readonly (number | undefined)[]
}

/**
 * The room along each half-edge, by half-edge index. A face that became no room and runs around
 * rooms that the hole pass gave to a container (the outer cycle of a free-standing group of walls)
 * bounds that container. A half-edge outside every outline bounds no room.
 */
function roomOfEachHalfEdge(walked: WalkedFaces): (number | undefined)[] {
  const { outlineFaceOfHalfEdge, containerOfRoom } = walked
  const roomOfFace = new Map(walked.roomOfFace)
  outlineFaceOfHalfEdge.forEach((face, halfEdge) => {
    const twinFace = outlineFaceOfHalfEdge[twinOf(halfEdge)]
    const twinRoom = twinFace === undefined ? undefined : walked.roomOfFace.get(twinFace)
    const container = twinRoom === undefined ? undefined : containerOfRoom[twinRoom]
    if (face !== undefined && !roomOfFace.has(face) && container !== undefined) {
      roomOfFace.set(face, container)
    }
  })
  return outlineFaceOfHalfEdge.map((face) =>
    face === undefined ? undefined : roomOfFace.get(face),
  )
}

/**
 * Assemble one room from its boundary. The clear interior insets by every edge's
 * half-thickness. The outer boundary outsets only on perimeter edges; a shared
 * edge (its twin belongs to another room face) takes a zero outward offset so it
 * stays on the centerline, where adjacent slabs meet edge to edge instead of
 * overlapping. `outsetPolygon` returns coordinates already snapped to its
 * sub-micrometer grid, so abutting slabs meet on exact coordinates without a snap
 * in this layer. See
 * [[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]] for the
 * shared-edge rule and
 * [[ADR-0134-geometry-primitive-snaps-polygon-offset-corners]] for why the snap
 * lives in the geometry primitive.
 */
function buildRoom(boundary: FaceBoundary, roomFaces: ReadonlySet<number>): Room {
  const { polygon, edgeOffsets, twinFaceIndices, wallIds } = boundary
  const outsetOffsets = edgeOffsets.map((offset, index) =>
    roomFaces.has(twinFaceIndices[index] ?? -1) ? 0 : offset,
  )
  const clearPolygon = insetPolygon(polygon, edgeOffsets)
  return {
    id: ROOM_ID_PREFIX + roomKey({ wallIds }),
    polygon,
    clearPolygon,
    outerPolygon: outsetPolygon(polygon, outsetOffsets),
    area: Math.abs(polygonArea(clearPolygon)),
    wallIds,
  }
}

/** The index of the half-edge that leaves edge `edgeIndex` from its `a` end. */
function halfEdgeFromA(edgeIndex: number): number {
  return 2 * edgeIndex
}

/** The index of the half-edge that leaves edge `edgeIndex` from its `b` end. */
function halfEdgeFromB(edgeIndex: number): number {
  return 2 * edgeIndex + 1
}

/** The index of the half-edge that runs the other way along the same edge. */
function twinOf(halfEdge: number): number {
  return halfEdge % 2 === 0 ? halfEdge + 1 : halfEdge - 1
}

/** Emit two directed half-edges, one in each direction, for every undirected edge. */
function buildHalfEdges(edges: readonly { a: number; b: number; wallId: string }[]): HalfEdge[] {
  return edges.flatMap((edge, edgeIndex) => [
    { index: halfEdgeFromA(edgeIndex), from: edge.a, to: edge.b, wallId: edge.wallId },
    { index: halfEdgeFromB(edgeIndex), from: edge.b, to: edge.a, wallId: edge.wallId },
  ])
}

/** Stable key for a directed half-edge: its ordered endpoints and host wall. */
function halfEdgeKey(from: number, to: number, wallId: string): string {
  return `${from}:${to}:${wallId}`
}

/**
 * Map every half-edge to the index of the face that claims it. Each half-edge is
 * walked by exactly one face, so the key resolves to a single face index.
 */
function facesByHalfEdge(faces: readonly HalfEdge[][]): Map<string, number> {
  const faceOfHalfEdge = new Map<string, number>()
  for (const [faceIndex, face] of faces.entries()) {
    for (const half of face) {
      faceOfHalfEdge.set(halfEdgeKey(half.from, half.to, half.wallId), faceIndex)
    }
  }
  return faceOfHalfEdge
}

/**
 * Index of the face owning a half-edge's twin (the reverse half-edge along the
 * same wall), or -1 when no face claims it. Per ADR-0129 the twin classifies the
 * edge: a kept room face means shared, the exterior face means perimeter.
 */
function twinFaceIndexOf(half: HalfEdge, faceOfHalfEdge: ReadonlyMap<string, number>): number {
  return faceOfHalfEdge.get(halfEdgeKey(half.to, half.from, half.wallId)) ?? -1
}

/**
 * Each junction's outgoing half-edge indices, in the order of its fan. The fans leave out an edge
 * from a junction to itself, so its two half-edges are in no list and no face walk steps onto them.
 */
function outgoingFromFans(graph: PlanarGraph, fans: JunctionFans): Map<number, number[]> {
  const outgoing = new Map<number, number[]>()
  for (const [junction, edgeIndexes] of fans) {
    outgoing.set(
      junction,
      edgeIndexes.map((edgeIndex) => {
        const leavesFromA = (graph.edges[edgeIndex] as GraphEdge).a === junction
        return leavesFromA ? halfEdgeFromA(edgeIndex) : halfEdgeFromB(edgeIndex)
      }),
    )
  }
  return outgoing
}

/** Read-only half-edge graph data shared across a single pass of face tracing. */
interface FaceWalk {
  halfEdges: readonly HalfEdge[]
  outgoing: ReadonlyMap<number, number[]>
}

/**
 * Trace every face of the half-edge graph. From each unvisited half-edge, follow
 * the clockwise-previous-of-the-twin successor until the walk returns to its
 * start; each closed walk is one face. A half-edge from a junction to itself starts no walk: it
 * would trace a face of one point with no area, and `nextHalfEdge` finds no twin for it.
 */
function enumerateFaces(
  halfEdges: readonly HalfEdge[],
  outgoing: ReadonlyMap<number, number[]>,
): HalfEdge[][] {
  const walk: FaceWalk = { halfEdges, outgoing }
  const visited = new Set<number>()
  const faces: HalfEdge[][] = []

  for (const start of halfEdges.keys()) {
    if (visited.has(start) || isFromJunctionToItself(halfEdges[start])) continue
    faces.push(traceFace(start, walk, visited))
  }
  return faces
}

/** True for a half-edge whose two ends are one junction. */
function isFromJunctionToItself(half: HalfEdge | undefined): boolean {
  return half !== undefined && half.from === half.to
}

/** Walk one face starting from a half-edge index, marking each visited half-edge. */
function traceFace(start: number, walk: FaceWalk, visited: Set<number>): HalfEdge[] {
  const face: HalfEdge[] = []
  let current = start
  do {
    visited.add(current)
    const half = walk.halfEdges[current]
    if (half === undefined) break
    face.push(half)
    current = nextHalfEdge(current, walk.halfEdges, walk.outgoing)
  } while (current !== start)
  return face
}

/**
 * The successor of a half-edge in a face walk: the half-edge immediately before
 * this one's twin, cyclically, in the angle-sorted outgoing list at the head. A half-edge from a
 * junction to itself has no twin in that list, so it is its own successor; `enumerateFaces` never
 * starts a walk there.
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
    // Both half-edges of a wall are created together in buildHalfEdges and share
    // its wallId, so matching wallId selects the reverse half-edge even when two
    // distinct walls connect the same vertex pair (parallel edges), where the
    // endpoint check alone would be ambiguous.
    return other !== undefined && other.to === half.from && other.wallId === half.wallId
  })
  if (twin === -1) return index
  const previous = group[(twin - 1 + group.length) % group.length]
  return previous ?? index
}

/**
 * A face corner paired with the inward inset of the edge leaving it: the tail
 * vertex index and half the leaving edge's host-wall effective thickness.
 */
interface BoundaryCorner {
  /** Index into the graph's vertices of this corner. */
  vertexIndex: number
  /** Half the effective thickness of the wall hosting the edge that leaves this corner. */
  halfThickness: number
  /**
   * Index of the face owning the leaving edge's twin; classifies the edge as
   * shared (a kept room face) or perimeter (the exterior face), per ADR-0129.
   */
  twinFaceIndex: number
  /** The index of the half-edge that leaves this corner along the outline. */
  halfEdge: number
}

/** Read-only inputs shared while building one face's boundary. */
interface BoundaryContext {
  /** Effective wall thickness, in millimeters, keyed by wall id. */
  thicknessByWallId: ReadonlyMap<string, number>
  /** Face index that owns each half-edge, keyed by {@link halfEdgeKey}. */
  faceOfHalfEdge: ReadonlyMap<string, number>
}

/** A face's centerline polygon with per-edge inset offsets and twin face indices. */
interface FaceBoundary {
  polygon: Point[]
  edgeOffsets: number[]
  /** For each edge, the face owning its twin (see {@link twinFaceIndexOf}). */
  twinFaceIndices: number[]
  /** Sorted, unique ids of the walls that enclose the face. */
  wallIds: string[]
  /** The indexes of the half-edges that leave the corners of `polygon`, in step with it. */
  outline: number[]
}

/**
 * Build the room boundary from a face's half-edges: the centerline `polygon` and
 * the per-edge inward inset distances, kept index-aligned so `edgeOffsets[i]` is
 * the inset for the edge from `polygon[i]` to `polygon[i+1]`. Spike removal runs
 * over corners carrying their leaving-edge offset, so the polygon and its offsets
 * drop the same excursions in step. The polygon matches the loop of cleaned tail
 * vertices exactly.
 */
function faceBoundary(
  face: readonly HalfEdge[],
  vertices: readonly Point[],
  context: BoundaryContext,
): FaceBoundary {
  const corners = removeSpikes(toBoundaryCorners(face, context))
  const polygon: Point[] = []
  const edgeOffsets: number[] = []
  const twinFaceIndices: number[] = []
  const outline: number[] = []
  for (const corner of corners) {
    const vertex = vertices[corner.vertexIndex]
    // Skipping a vertex also skips its paired offset, twin face, and half-edge,
    // keeping the four arrays index-aligned.
    if (vertex === undefined) continue
    polygon.push(vertex)
    edgeOffsets.push(corner.halfThickness)
    twinFaceIndices.push(corner.twinFaceIndex)
    outline.push(corner.halfEdge)
  }
  return { polygon, edgeOffsets, twinFaceIndices, wallIds: sortedUniqueWallIds(face), outline }
}

/**
 * Pair each face corner with half its leaving edge's host-wall effective thickness and the
 * face owning that edge's twin (which classifies it shared or perimeter).
 */
function toBoundaryCorners(face: readonly HalfEdge[], context: BoundaryContext): BoundaryCorner[] {
  return face.map((half) => {
    const thickness = context.thicknessByWallId.get(half.wallId) ?? DEFAULT_WALL_THICKNESS
    return {
      vertexIndex: half.from,
      halfThickness: thickness / 2,
      twinFaceIndex: twinFaceIndexOf(half, context.faceOfHalfEdge),
      halfEdge: half.index,
    }
  })
}

/**
 * Remove dangling-stub spikes from a closed loop of boundary corners. A spike is a
 * `v -> s -> v` excursion: the path walks out to a tip `s` and immediately back to
 * the same vertex `v`. Treating the loop as cyclic, a tip is any position whose
 * previous and next neighbors are the same vertex; drop the tip and the duplicated
 * next neighbor, and re-point the surviving corner's leaving-edge data (its offset,
 * twin face, and half-edge) to that next neighbor's (the edge `v` now continues
 * along). Restart until no spike remains. The two half-edges of the spike leave the
 * outline, so they bound no room.
 *
 * Dangling stub walls are dead-end artifacts of the half-edge walk traversing into
 * and back out of a stub, and their stub endpoints must not appear as room corners.
 */
function removeSpikes(loop: BoundaryCorner[]): BoundaryCorner[] {
  const cleaned = loop.map((corner) => ({ ...corner }))
  let changed = true
  while (changed && cleaned.length > 2) {
    changed = false
    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = cleaned[(index - 1 + cleaned.length) % cleaned.length]
      const next = cleaned[(index + 1) % cleaned.length]
      // Both guards satisfy noUncheckedIndexedAccess; once `previous` is defined,
      // `next !== undefined` is structurally implied (the loop has at least three
      // corners), but the check keeps the type narrowing explicit.
      if (
        previous !== undefined &&
        next !== undefined &&
        previous.vertexIndex === next.vertexIndex
      ) {
        // The surviving corner `v` (at `previous`) keeps the spike's exit edge, so
        // its offset, twin face, and half-edge become the next neighbor's (the edge
        // `v` continues along).
        previous.halfThickness = next.halfThickness
        previous.twinFaceIndex = next.twinFaceIndex
        previous.halfEdge = next.halfEdge
        // Drop the spike tip, then the duplicated neighbor. Removing the tip shifts
        // every later element left by one, so the duplicate that was at `index + 1`
        // now sits at `index % cleaned.length` (the modulus only matters when the
        // tip was the final element and the duplicate wraps to 0).
        cleaned.splice(index, 1)
        cleaned.splice(index % cleaned.length, 1)
        changed = true
        break
      }
    }
  }
  return cleaned
}

/** Sorted, unique wall ids of a face's half-edges. */
function sortedUniqueWallIds(face: readonly HalfEdge[]): string[] {
  return [...new Set(face.map((half) => half.wallId))].sort()
}
