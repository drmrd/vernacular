import { insetPolygon, outsetPolygon, pointInPolygon, polygonArea } from '../geometry/polygon'
import { MIN_FACE_AREA_MM2 } from '../geometry/tolerance'
import type { Point } from '../model/types'
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
  /** Index into the graph's vertices of the half-edge's tail. */
  from: number
  /** Index into the graph's vertices of the half-edge's head. */
  to: number
  /** The id of the wall this half-edge was derived from. */
  wallId: string
}

/**
 * Derive rooms from a prepared wall graph by enumerating its bounded faces. See the
 * design specification, section 3.2 ("Rooms are derived from wall topology"). Each
 * closed loop of walls becomes one room.
 */
export function roomsOfGraph(
  graph: PlanarGraph,
  thicknessByWallId: ReadonlyMap<string, number>,
  fans: ReadonlyMap<number, readonly number[]>,
): Room[] {
  const halfEdges = buildHalfEdges(graph.edges)
  const faces = enumerateFaces(halfEdges, outgoingFromFans(graph, fans))
  const faceOfHalfEdge = facesByHalfEdge(faces)

  const boundaries = faces.map((face) =>
    faceBoundary(face, graph.vertices, { thicknessByWallId, faceOfHalfEdge }),
  )
  // A face becomes a room when its centerline polygon clears the minimum area;
  // the negative-area outer (unbounded) face is excluded. An edge is shared when
  // its twin belongs to one of these kept room faces.
  const roomFaces = new Set<number>()
  boundaries.forEach((boundary, index) => {
    if (polygonArea(boundary.polygon) > MIN_FACE_AREA_MM2) roomFaces.add(index)
  })

  const rooms: Room[] = []
  for (const faceIndex of roomFaces) {
    const boundary = boundaries[faceIndex]
    if (boundary === undefined) continue
    rooms.push(buildRoom(boundary, roomFaces))
  }
  return assignHoles(rooms)
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

/**
 * True when every vertex of `inner.polygon` lies inside `outer.polygon` and the two
 * rooms share no bounding walls. The disjoint-wall guard distinguishes a free-standing
 * inner loop, which becomes a hole, from a room merely subdivided by a shared wall,
 * which the face walk already handles correctly.
 */
function isContainedBy(inner: Room, outer: Room): boolean {
  const outerWalls = new Set(outer.wallIds)
  if (inner.wallIds.some((wallId) => outerWalls.has(wallId))) return false
  return inner.polygon.every((vertex) => pointInPolygon(vertex, outer.polygon))
}

/**
 * The immediate container of `inner`: among all rooms that contain it, the one with
 * the smallest area, so a nested void is punched once at the level it belongs to.
 * Returns `undefined` when no room contains `inner`.
 */
function immediateContainer(inner: Room, rooms: readonly Room[]): Room | undefined {
  const containers = rooms.filter(
    (candidate) => candidate !== inner && isContainedBy(inner, candidate),
  )
  return containers.reduce<Room | undefined>(
    (smallest, candidate) =>
      smallest === undefined || candidate.area < smallest.area ? candidate : smallest,
    undefined,
  )
}

/**
 * Add each contained room's `polygon` to its immediate container as a hole, and
 * reduce that container's `area` by the hole's centerline footprint. Contained rooms
 * remain their own derived rooms, unchanged. A room with no holes keeps its fields.
 */
function assignHoles(rooms: readonly Room[]): Room[] {
  const holesByRoom = new Map<Room, Point[][]>()
  for (const inner of rooms) {
    const container = immediateContainer(inner, rooms)
    if (container === undefined) continue
    const existing = holesByRoom.get(container)
    if (existing !== undefined) {
      existing.push(inner.polygon)
    } else {
      holesByRoom.set(container, [inner.polygon])
    }
  }
  return rooms.map((room) => withHoles(room, holesByRoom.get(room)))
}

/** Attach holes and the void-reduced area to a container; pass others through. */
function withHoles(room: Room, holes: Point[][] | undefined): Room {
  if (holes === undefined) return room
  const voidArea = holes.reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0)
  return { ...room, holes, area: room.area - voidArea }
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
 * Each junction's outgoing half-edge indices, in the order of its fan. Edge `i` makes
 * half-edge `2i` from its `a` end and `2i + 1` from its `b` end, as `buildHalfEdges` emits them.
 */
function outgoingFromFans(
  graph: PlanarGraph,
  fans: ReadonlyMap<number, readonly number[]>,
): Map<number, number[]> {
  const outgoing = new Map<number, number[]>()
  for (const [junction, edgeIndexes] of fans) {
    outgoing.set(
      junction,
      edgeIndexes.map((edgeIndex) => {
        const leavesFromA = (graph.edges[edgeIndex] as GraphEdge).a === junction
        return leavesFromA ? 2 * edgeIndex : 2 * edgeIndex + 1
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
 * start; each closed walk is one face.
 */
function enumerateFaces(
  halfEdges: readonly HalfEdge[],
  outgoing: ReadonlyMap<number, number[]>,
): HalfEdge[][] {
  const walk: FaceWalk = { halfEdges, outgoing }
  const visited = new Set<number>()
  const faces: HalfEdge[][] = []

  for (const start of halfEdges.keys()) {
    if (visited.has(start)) continue
    faces.push(traceFace(start, walk, visited))
  }
  return faces
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
  for (const corner of corners) {
    const vertex = vertices[corner.vertexIndex]
    // Skipping a vertex also skips its paired offset and twin face, keeping the
    // three arrays index-aligned.
    if (vertex === undefined) continue
    polygon.push(vertex)
    edgeOffsets.push(corner.halfThickness)
    twinFaceIndices.push(corner.twinFaceIndex)
  }
  return { polygon, edgeOffsets, twinFaceIndices, wallIds: sortedUniqueWallIds(face) }
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
    }
  })
}

/**
 * Remove dangling-stub spikes from a closed loop of boundary corners. A spike is a
 * `v -> s -> v` excursion: the path walks out to a tip `s` and immediately back to
 * the same vertex `v`. Treating the loop as cyclic, a tip is any position whose
 * previous and next neighbors are the same vertex; drop the tip and the duplicated
 * next neighbor, and re-point the surviving corner's leaving-edge data (its offset
 * and twin face) to that next neighbor's (the edge `v` now continues along).
 * Restart until no spike remains.
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
        // its offset and twin face become the next neighbor's (the edge `v`
        // continues along).
        previous.halfThickness = next.halfThickness
        previous.twinFaceIndex = next.twinFaceIndex
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
