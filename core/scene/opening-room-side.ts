import { pointInPolygon } from '../geometry/polygon'
import type { OpeningOrientation, Point } from '../model/types'
import type { OpeningSceneNode, RoomSceneNode } from './scene-graph'
import { HALF } from './wall-half'

/**
 * The clearance, in mm, past the wall face that the room uses, so the sample lies clearly inside
 * a room that begins at that face.
 */
export const OPENING_ROOM_SIDE_SAMPLE_MM = 50

/**
 * True when the point lies in the room's clear polygon and in none of its holes. Unlike
 * `insideAnyRoom` in exterior-walls.ts, this excludes holes; the two are kept apart on purpose.
 */
function insideRoom(point: Point, room: RoomSceneNode): boolean {
  if (!pointInPolygon(point, room.clearPolygon)) return false
  return !(room.holes ?? []).some((hole) => pointInPolygon(point, hole))
}

/** The point at `distance` from the opening's center along its normal, signed by `direction`. */
function sampleAcross(node: OpeningSceneNode, direction: 1 | -1, distance: number): Point {
  return {
    x: node.center.x + node.normal.x * distance * direction,
    y: node.center.y + node.normal.y * distance * direction,
  }
}

/**
 * The side of an opening's wall, as a sign of the opening's `normal`, that lies in a room at the
 * opening's own center: 'positive' when only the point `center + normal * d` lies in a room,
 * 'negative' when only `center - normal * d` does, where d = max(rawWallThickness,
 * node.hostThickness) / 2 + OPENING_ROOM_SIDE_SAMPLE_MM. A point lies in a room when it is inside
 * the room's clearPolygon and inside none of its holes. Only rooms on the opening's floor count.
 * Undefined when both points or neither lie in a room: a wall between two rooms, or one that
 * bounds no room there.
 *
 * Today a room's clear polygon is inset by the raw thickness of its walls (issue #674). Once
 * rooms follow the faces of the construction profile, the effective thickness takes over. Taking
 * the larger of the two puts the sample past the face the room uses in either case.
 *
 * The side is sampled at the opening, not at the middle of the wall, because one long wall can
 * bound a room along only part of its length: the middle of the wall can lie beside a room that
 * the opening is nowhere near, or beside none while the opening stands in front of one.
 */
export function openingRoomSide(
  node: OpeningSceneNode,
  rooms: readonly RoomSceneNode[],
  rawWallThickness: number,
): OpeningOrientation['facing'] | undefined {
  const distance =
    Math.max(rawWallThickness, node.hostThickness) / HALF + OPENING_ROOM_SIDE_SAMPLE_MM
  const floorRooms = rooms.filter((room) => room.floorId === node.floorId)
  const positive = floorRooms.some((room) => insideRoom(sampleAcross(node, 1, distance), room))
  const negative = floorRooms.some((room) => insideRoom(sampleAcross(node, -1, distance), room))
  if (positive === negative) return undefined
  return positive ? 'positive' : 'negative'
}

/** The node with `roomSide` set from openingRoomSide, or the node without it when undefined. */
export function withRoomSide(
  node: OpeningSceneNode,
  rooms: readonly RoomSceneNode[],
  rawWallThickness: number,
): OpeningSceneNode {
  const roomSide = openingRoomSide(node, rooms, rawWallThickness)
  return roomSide === undefined ? node : { ...node, roomSide }
}
