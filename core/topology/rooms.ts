import { polygonArea } from '../geometry/polygon'
import type { Point, RoomOverride, Wall } from '../model/types'
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
  /**
   * User-entered display name merged in from a stored `RoomOverride`. Absent on a
   * freshly derived room; single-sourced with `RoomSceneNode.name` in a later task.
   */
  name?: string
}

/**
 * Smallest positive area, in squared millimeters, that a traced face must exceed
 * to count as a room. Filters out the single negative-area outer (unbounded)
 * face produced by the half-edge walk.
 */
const MIN_ROOM_AREA = 1

/** Namespace prefix that distinguishes a room id from its stable key. */
export const ROOM_ID_PREFIX = 'room:'

/**
 * The stable key for a room: the sorted bounding-wall-id string that `Room.id`
 * encodes, without the `room:` prefix. `room.id === ROOM_ID_PREFIX + roomKey(room)`
 * for every derived room, and the key depends only on the room's bounding wall ids
 * (sorted, unique), so re-derivation and different insertion order yield the same key.
 */
export function roomKey(room: Pick<Room, 'wallIds'>): string {
  return room.wallIds.join('-')
}

/**
 * Merge stored overrides onto derived rooms, keyed by `roomKey`. A stored `name`
 * is attached; a stored `customPolygon` replaces the derived polygon and recomputes
 * the area as the non-negative shoelace area. Rooms without a matching override are
 * returned unchanged. An absent `overrides` map returns the input rooms unchanged.
 * Iteration is over `rooms`, so a stale override key never synthesizes a room.
 */
export function applyRoomOverrides(
  rooms: readonly Room[],
  overrides: Readonly<Record<string, RoomOverride>> | undefined,
): Room[] {
  if (overrides === undefined) return [...rooms]
  return rooms.map((room) => mergeOverride(room, overrides[roomKey(room)]))
}

/** Apply one room's override, or return it unchanged when there is no override. */
function mergeOverride(room: Room, override: RoomOverride | undefined): Room {
  if (override === undefined) return room
  const merged: Room = { ...room }
  if (override.name !== undefined) merged.name = override.name
  if (override.customPolygon !== undefined) {
    merged.polygon = override.customPolygon
    merged.area = Math.abs(polygonArea(override.customPolygon))
  }
  return merged
}

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
    rooms.push({ id: ROOM_ID_PREFIX + roomKey({ wallIds }), polygon, area, wallIds })
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
function enumerateFaces(halfEdges: readonly HalfEdge[], vertices: readonly Point[]): HalfEdge[][] {
  const walk: FaceWalk = {
    halfEdges,
    outgoing: outgoingByVertex(halfEdges, vertices),
  }
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

/** Build a polygon from the tail vertices of a face's half-edges. */
function facePolygon(face: readonly HalfEdge[], vertices: readonly Point[]): Point[] {
  const loop = removeSpikes(face.map((half) => half.from))
  const polygon: Point[] = []
  for (const index of loop) {
    const vertex = vertices[index]
    if (vertex !== undefined) polygon.push(vertex)
  }
  return polygon
}

/**
 * Remove dangling-stub spikes from a closed loop of vertex indices. A spike is a
 * `v -> s -> v` excursion: the path walks out to a tip `s` and immediately back to
 * the same vertex `v`. Treating the loop as cyclic, a tip is any position whose
 * previous and next neighbors are the same vertex; drop the tip and one of those
 * duplicated neighbors, then restart until no spike remains.
 *
 * Dangling stub walls are dead-end artifacts of the half-edge walk traversing into
 * and back out of a stub, and their stub endpoints must not appear as room corners.
 */
function removeSpikes(loop: number[]): number[] {
  const cleaned = [...loop]
  let changed = true
  while (changed && cleaned.length > 2) {
    changed = false
    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = cleaned[(index - 1 + cleaned.length) % cleaned.length]
      const next = cleaned[(index + 1) % cleaned.length]
      // `next !== undefined` is implied by the equality with the defined `previous`,
      // but stated explicitly so the asymmetric guard is self-documenting.
      if (previous !== undefined && next !== undefined && previous === next) {
        // Drop the spike tip, then drop the duplicated neighbor. Removing the tip
        // shifts every later element left by one, so the `next` duplicate that was
        // at `index + 1` now sits at `index % cleaned.length` (the modulus only
        // matters when the tip was the final element and the duplicate wraps to 0).
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
