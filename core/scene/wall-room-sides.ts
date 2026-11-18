import { distance } from '../geometry/point'
import { pointOnSegment } from '../geometry/segment'
import { dot, leftNormal, leftPerp, shift, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'
import { DEFAULT_JUNCTION_TOLERANCE_MM } from '../topology/wall-graph'
import type { RoomSceneNode, WallSceneNode } from './scene-graph'
import { signedArea } from './winding'

/**
 * Which sides of a wall have a room along them at one place. `'positive'` is the side the wall's
 * normal points to; for a wall that is the left-hand normal from its start to its end
 * (`leftNormal(start, end)` in core/geometry/vector.ts), the same sign as an opening's `facing`.
 * `'both'` is a wall between two rooms there (or a wall that a room runs along on both sides, such
 * as a partition joining a shaft to the outer walls). `'neither'` is a wall with no room along it
 * there (a free wall, a dangling stub, or the stretch of a long wall past the end of its room).
 */
export type WallRoomSides = 'positive' | 'negative' | 'both' | 'neither'

/**
 * How far, in mm, a room corner may lie from a wall centerline and still count as on it. It equals
 * DEFAULT_JUNCTION_TOLERANCE_MM in core/topology/wall-graph.ts, the distance within which the wall
 * graph merges wall ends, so every corner of a derived room counts as on the walls it was traced
 * from.
 */
export const ROOM_RING_TOLERANCE_MM = DEFAULT_JUNCTION_TOLERANCE_MM

/** One place on a wall centerline. */
export interface WallPlace {
  /** A point on the wall's centerline, in plan mm. */
  point: Point
  /** A unit vector perpendicular to the wall. The side it points to is the `'positive'` side. */
  normal: Point
  /** Only rooms on this floor count. */
  floorId: string
}

/** A stretch of one wall over which the same sides have a room along them. */
export interface WallStretch {
  /** Where the stretch starts, in mm along the wall from its `start`. */
  fromMm: number
  /** Where the stretch ends, in mm along the wall from its `start`. Greater than `fromMm`. */
  toMm: number
  /** The sides with a room along them over the whole stretch, signed by leftNormal(start, end). */
  sides: WallRoomSides
}

interface RoomRing {
  points: readonly Point[]
  isHole: boolean
}

interface SideFlags {
  positive: boolean
  negative: boolean
}

const MIDDLE_FRACTION = 0.5

function roomRings(room: RoomSceneNode): RoomRing[] {
  const holes = (room.holes ?? []).map((points) => ({ points, isHole: true }))
  return [{ points: room.polygon, isHole: false }, ...holes]
}

function roomsOnFloor(rooms: readonly RoomSceneNode[], floorId: string): RoomSceneNode[] {
  return rooms.filter((room) => room.floorId === floorId)
}

/** True when the room lies to the left of the ring's edges (its direction of travel). */
function roomIsLeftOfRing(ring: RoomRing): boolean {
  const isCounterClockwise = signedArea([...ring.points]) > 0
  return isCounterClockwise !== ring.isHole
}

function edgeRunsAlongWall(place: WallPlace, from: Point, to: Point): boolean {
  if (distance(from, to) < ROOM_RING_TOLERANCE_MM) return false
  const isOnLine = (corner: Point): boolean =>
    Math.abs(dot(subtract(corner, place.point), place.normal)) <= ROOM_RING_TOLERANCE_MM
  return (
    isOnLine(from) && isOnLine(to) && pointOnSegment(place.point, from, to, ROOM_RING_TOLERANCE_MM)
  )
}

function ringSideFlags(place: WallPlace, ring: RoomRing): SideFlags {
  const flags: SideFlags = { positive: false, negative: false }
  const roomIsLeft = roomIsLeftOfRing(ring)
  ring.points.forEach((from, index) => {
    const to = ring.points[(index + 1) % ring.points.length] as Point
    if (!edgeRunsAlongWall(place, from, to)) return
    const leftOfEdge = leftPerp(subtract(to, from))
    const roomSide = roomIsLeft ? leftOfEdge : { x: -leftOfEdge.x, y: -leftOfEdge.y }
    if (dot(roomSide, place.normal) > 0) flags.positive = true
    else flags.negative = true
  })
  return flags
}

function sidesFromFlags(flags: SideFlags): WallRoomSides {
  if (flags.positive && flags.negative) return 'both'
  if (flags.positive) return 'positive'
  return flags.negative ? 'negative' : 'neither'
}

/**
 * The sides of the wall at `place` that have a room along them. A room lies along a side when an
 * edge u -> v of one of its rings runs along the wall there: u and v both lie within
 * ROOM_RING_TOLERANCE_MM of the line through `place.point` perpendicular to `place.normal`, and
 * `place.point` lies within ROOM_RING_TOLERANCE_MM of the segment from u to v. Ring edges shorter
 * than ROOM_RING_TOLERANCE_MM are ignored. The rings of a room are its `polygon` and each of its
 * `holes`. The room lies to the left of u -> v when the ring is its `polygon` with a positive
 * signed area (counter-clockwise in the y-up plan), and to the right when that area is negative.
 * For a hole ring the room lies on the other side, outside the hole. That side is `'positive'` when
 * `place.normal` points into it. Only rooms whose `floorId` equals `place.floorId` count.
 *
 * No point is tested against the inside of a polygon, and no thickness is read: the answer depends
 * only on which room boundaries run along the wall's centerline (ADR-0218).
 */
export function roomSidesAt(place: WallPlace, rooms: readonly RoomSceneNode[]): WallRoomSides {
  const flags: SideFlags = { positive: false, negative: false }
  for (const room of roomsOnFloor(rooms, place.floorId)) {
    for (const ring of roomRings(room)) {
      const ringFlags = ringSideFlags(place, ring)
      flags.positive ||= ringFlags.positive
      flags.negative ||= ringFlags.negative
    }
  }
  return sidesFromFlags(flags)
}

/** The distances along the wall at which a room ring corner lies on the wall's centerline. */
function cornerCutsMm(wall: WallSceneNode, rooms: readonly RoomSceneNode[]): number[] {
  const direction = unit(subtract(wall.end, wall.start))
  return roomsOnFloor(rooms, wall.floorId)
    .flatMap(roomRings)
    .flatMap((ring) => [...ring.points])
    .filter((corner) => pointOnSegment(corner, wall.start, wall.end, ROOM_RING_TOLERANCE_MM))
    .map((corner) => dot(subtract(corner, wall.start), direction))
}

/** The sorted cut positions from 0 to the wall length, with near-duplicates and near-ends dropped. */
function boundariesMm(cuts: readonly number[], lengthMm: number): number[] {
  const boundaries = [0]
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    const last = boundaries[boundaries.length - 1] as number
    if (cut - last >= ROOM_RING_TOLERANCE_MM && lengthMm - cut >= ROOM_RING_TOLERANCE_MM) {
      boundaries.push(cut)
    }
  }
  boundaries.push(lengthMm)
  return boundaries
}

/**
 * The wall from its start to its end, cut at every corner of a room ring (a corner of a room's
 * `polygon` or of one of its `holes`, for rooms on `wall.floorId`) that lies within
 * ROOM_RING_TOLERANCE_MM of the wall's centerline segment. Each piece takes the sides that
 * roomSidesAt reads at its middle, with the normal leftNormal(wall.start, wall.end) and the floor
 * `wall.floorId`. Neighboring pieces with the same sides are joined, so no two neighbors in the
 * result share `sides`. The stretches cover 0 to the wall's length without gaps, in order from the
 * start. Cuts closer than ROOM_RING_TOLERANCE_MM to each other, or to an end of the wall, count as
 * one. A wall no longer than ROOM_RING_TOLERANCE_MM has no stretches.
 */
export function wallStretches(wall: WallSceneNode, rooms: readonly RoomSceneNode[]): WallStretch[] {
  const lengthMm = distance(wall.start, wall.end)
  if (lengthMm <= ROOM_RING_TOLERANCE_MM) return []
  const direction = unit(subtract(wall.end, wall.start))
  const normal = leftNormal(wall.start, wall.end)
  const boundaries = boundariesMm(cornerCutsMm(wall, rooms), lengthMm)
  const stretches: WallStretch[] = []
  for (let index = 1; index < boundaries.length; index += 1) {
    const fromMm = boundaries[index - 1] as number
    const toMm = boundaries[index] as number
    const middle = shift(wall.start, direction, (fromMm + toMm) * MIDDLE_FRACTION)
    const sides = roomSidesAt({ point: middle, normal, floorId: wall.floorId }, rooms)
    const previous = stretches[stretches.length - 1]
    if (previous?.sides === sides) previous.toMm = toMm
    else stretches.push({ fromMm, toMm, sides })
  }
  return stretches
}
