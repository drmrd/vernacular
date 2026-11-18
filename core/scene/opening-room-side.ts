import type { OpeningOrientation } from '../model/types'
import type { OpeningSceneNode, RoomSceneNode } from './scene-graph'
import { roomSidesAt } from './wall-room-sides'

/**
 * The side of an opening's wall, as a sign of the opening's `normal`, that has a room along it at
 * the opening's center: roomSidesAt({ point: node.center, normal: node.normal, floorId:
 * node.floorId }, rooms) when that is 'positive' or 'negative', and undefined when it is 'both'
 * (a wall between two rooms there) or 'neither' (no room along the wall there). It is the rule
 * exteriorWalls uses (ADR-0218): a derived opening has a room side exactly when its center lies on
 * an exterior run of its host wall.
 *
 * The side is read at the opening, not for the whole wall, because one long wall can bound a room
 * along only part of its length.
 *
 * `_rawWallThickness` is not read: the rule depends on no thickness and no construction profile.
 * It stays optional until the callers in bridge/react/harness-fixtures.ts and its test stop
 * passing it.
 */
export function openingRoomSide(
  node: OpeningSceneNode,
  rooms: readonly RoomSceneNode[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for callers in bridge/ that still pass it
  _rawWallThickness?: number,
): OpeningOrientation['facing'] | undefined {
  const sides = roomSidesAt(
    { point: node.center, normal: node.normal, floorId: node.floorId },
    rooms,
  )
  return sides === 'positive' || sides === 'negative' ? sides : undefined
}

/**
 * The node with `roomSide` set from openingRoomSide, or the node without it when undefined.
 * `_rawWallThickness` is not read (see openingRoomSide).
 */
export function withRoomSide(
  node: OpeningSceneNode,
  rooms: readonly RoomSceneNode[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for callers in bridge/ that still pass it
  _rawWallThickness?: number,
): OpeningSceneNode {
  const roomSide = openingRoomSide(node, rooms)
  return roomSide === undefined ? node : { ...node, roomSide }
}
