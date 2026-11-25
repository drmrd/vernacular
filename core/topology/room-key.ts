import type { Room } from './rooms'

/** Namespace prefix that distinguishes a room id from its stable key. */
export const ROOM_ID_PREFIX = 'room:'

/**
 * The stable key for a room: the pre-sorted bounding-wall ids joined with `|` that
 * `Room.id` encodes, without the `room:` prefix. This function does not sort; it
 * trusts the caller to supply already-sorted ids (`deriveRooms` does so via
 * `sortedUniqueWallIds`). The pipe separator keeps the key unambiguous because wall
 * ids themselves contain `-`.
 * `room.id === ROOM_ID_PREFIX + roomKey(room)` for every derived room, and the key
 * depends only on the room's bounding wall ids (sorted, unique), so re-derivation
 * and different insertion order yield the same key.
 */
export function roomKey(room: Pick<Room, 'wallIds'>): string {
  return room.wallIds.join('|')
}
