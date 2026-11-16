import type { DaylightAperture, DaylightRoom } from './daylight-field'

/** Fewest outline points that enclose a floor area. */
const MINIMUM_OUTLINE_POINTS = 3

/** Where a bad daylight input sits among the rooms of one floor; both indexes are zero-based. */
export interface DaylightInputLocation {
  room: number
  aperture?: number
}

/**
 * The error for a room or an aperture that the daylight field cannot use. Every message names the
 * place in the same words, "room <index>" and then "aperture <index>", both zero-based, so a
 * caller can find the input in its own list.
 */
export function daylightInputError(location: DaylightInputLocation, problem: string): RangeError {
  const place =
    location.aperture === undefined
      ? `room ${location.room}`
      : `room ${location.room}, aperture ${location.aperture}`
  return new RangeError(`Daylight field ${place}: ${problem}`)
}

function validateAperture(
  aperture: DaylightAperture,
  location: DaylightInputLocation,
  roomCount: number,
): void {
  const [start, end] = aperture.span
  if (!(Math.hypot(end.x - start.x, end.y - start.y) > 0)) {
    throw daylightInputError(location, 'its span has no length')
  }
  if (aperture.opensTo === 'sky') return
  const neighbor = aperture.opensTo.room
  if (neighbor === location.room) {
    throw daylightInputError(location, 'it opens to its own room')
  }
  if (!Number.isInteger(neighbor) || neighbor < 0 || neighbor >= roomCount) {
    throw daylightInputError(
      location,
      `it opens to room ${neighbor}, but the floor has ${roomCount} rooms`,
    )
  }
}

/**
 * Throws a RangeError for the first room or aperture that the daylight field cannot use: an
 * outline of fewer than three points, a span of no length, or a doorway that opens to its own room
 * or to a room that does not exist. The side test of each span runs with the geometry pass.
 */
export function validateDaylightRooms(rooms: readonly DaylightRoom[]): void {
  for (const [roomIndex, room] of rooms.entries()) {
    if (room.outline.length < MINIMUM_OUTLINE_POINTS) {
      throw daylightInputError(
        { room: roomIndex },
        `an outline needs at least ${MINIMUM_OUTLINE_POINTS} points, and this one has ${room.outline.length}`,
      )
    }
    for (const [apertureIndex, aperture] of room.apertures.entries()) {
      validateAperture(aperture, { room: roomIndex, aperture: apertureIndex }, rooms.length)
    }
  }
}
