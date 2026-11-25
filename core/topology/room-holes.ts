import { pointInPolygon, polygonArea } from '../geometry/polygon'
import type { Point } from '../model/types'
import type { Room } from './rooms'

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
export function immediateContainer(inner: Room, rooms: readonly Room[]): Room | undefined {
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
export function assignHoles(
  rooms: readonly Room[],
  containers: readonly (Room | undefined)[],
): Room[] {
  const holesByRoom = new Map<Room, Point[][]>()
  for (const [index, inner] of rooms.entries()) {
    const container = containers[index]
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
