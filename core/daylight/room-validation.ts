import { pointOnSegment } from '../geometry/segment'
import type { Point } from '../model/types'
import type { DaylightAperture, DaylightRoom } from './daylight-field'

/** Fewest outline points that enclose a floor area. */
const MINIMUM_OUTLINE_POINTS = 3

/**
 * How far, in millimetres, a span end point may sit from the room outline and still count as on it.
 * It exists for the floating-point error of plan coordinates: a point interpolated along a wall that
 * is not parallel to an axis is off the exact line by rounding error. The value is far below any
 * real dimension, so it still refuses an end point that is a few millimetres off the wall.
 * It must not exceed SIDE_PROBE_MM of room-geometry.ts. The side test needs one probe on each side
 * of the outline, so a span that lies off its wall by more than the probe distance has both probes
 * on one side and is refused. At the present equal values, a span that lies off its wall by exactly
 * this distance is also refused, because a probe that lands on the outline counts as inside.
 */
const OUTLINE_TOLERANCE_MM = 1

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

function requireFinite(value: number, name: string, location: DaylightInputLocation): void {
  if (!Number.isFinite(value)) {
    throw daylightInputError(location, `${name} must be a finite number`)
  }
}

function validateOutlineCoordinates(
  outline: readonly Point[],
  location: DaylightInputLocation,
): void {
  for (const [vertexIndex, vertex] of outline.entries()) {
    if (!(Number.isFinite(vertex.x) && Number.isFinite(vertex.y))) {
      throw daylightInputError(
        location,
        `outline vertex ${vertexIndex} has a coordinate that is not finite; a coordinate must be a finite number`,
      )
    }
  }
}

function validateRoomValues(room: DaylightRoom, location: DaylightInputLocation): void {
  if (!(Number.isFinite(room.ceilingHeight) && room.ceilingHeight > 0)) {
    throw daylightInputError(location, 'ceiling height must be a finite number above 0')
  }
  requireFinite(room.floorColor.r, 'floor color red', location)
  requireFinite(room.floorColor.g, 'floor color green', location)
  requireFinite(room.floorColor.b, 'floor color blue', location)
}

function validateApertureHeights(
  aperture: DaylightAperture,
  ceilingHeight: number,
  location: DaylightInputLocation,
): void {
  requireFinite(aperture.sill, 'sill', location)
  requireFinite(aperture.head, 'head', location)
  if (!(Number.isFinite(aperture.revealDepth) && aperture.revealDepth >= 0)) {
    throw daylightInputError(location, 'reveal depth must be a finite number of 0 or more')
  }
  if (!(aperture.head > aperture.sill)) {
    throw daylightInputError(location, 'head must be above sill')
  }
  if (aperture.head > ceilingHeight) {
    throw daylightInputError(location, 'head must not be above the ceiling height')
  }
}

function pointOnOutline(point: Point, outline: readonly Point[]): boolean {
  return outline.some((current, index) => {
    const previous = outline[(index + outline.length - 1) % outline.length] ?? current
    return pointOnSegment(point, previous, current, OUTLINE_TOLERANCE_MM)
  })
}

function validateApertureSpan(
  aperture: DaylightAperture,
  outline: readonly Point[],
  location: DaylightInputLocation,
): void {
  const [start, end] = aperture.span
  if (!(Math.hypot(end.x - start.x, end.y - start.y) > 0)) {
    throw daylightInputError(location, 'its span has no length')
  }
  if (!pointOnOutline(start, outline) || !pointOnOutline(end, outline)) {
    throw daylightInputError(location, 'both end points of its span must lie on the room outline')
  }
}

function validateAperture(
  aperture: DaylightAperture,
  location: DaylightInputLocation,
  context: { room: DaylightRoom; roomCount: number },
): void {
  const { room, roomCount } = context
  validateApertureHeights(aperture, room.ceilingHeight, location)
  validateApertureSpan(aperture, room.outline, location)
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
 * outline of fewer than three points, an outline coordinate that is not a finite number, a
 * ceiling or floor color that is not a finite number, a sill, head, or reveal depth that is not
 * usable, a head above the ceiling, a span of no length or with an end point off the outline, or a
 * doorway that opens to its own room or to a room that does not exist. The side test of the
 * midpoint of each span runs with the geometry pass.
 */
export function validateDaylightRooms(rooms: readonly DaylightRoom[]): void {
  for (const [roomIndex, room] of rooms.entries()) {
    if (room.outline.length < MINIMUM_OUTLINE_POINTS) {
      throw daylightInputError(
        { room: roomIndex },
        `an outline needs at least ${MINIMUM_OUTLINE_POINTS} points, and this one has ${room.outline.length}`,
      )
    }
    validateOutlineCoordinates(room.outline, { room: roomIndex })
    validateRoomValues(room, { room: roomIndex })
    for (const [apertureIndex, aperture] of room.apertures.entries()) {
      validateAperture(
        aperture,
        { room: roomIndex, aperture: apertureIndex },
        { room, roomCount: rooms.length },
      )
    }
  }
}
