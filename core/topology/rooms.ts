import { polygonArea } from '../geometry/polygon'
import type { Point, RoomOverride, Wall } from '../model/types'
import { effectiveWallThickness } from '../scene/construction-profile'
import { ROOM_ID_PREFIX, roomKey } from './room-key'
import { roomsOfGraph } from './room-walk'
import { buildWallGraph } from './wall-graph'

export { ROOM_ID_PREFIX, roomKey }

/** A bounded region of floor enclosed by walls, derived from the wall topology. */
export interface Room {
  /** Stable identifier built from the sorted ids of the walls that enclose the room. */
  id: string
  /** Corner points of the room boundary, in floor-plan space. */
  polygon: Point[]
  /**
   * The centerline `polygon` inset inward by each bounding wall's half effective (construction-profile
   * assembly) thickness: the thickness-aware clear floor area boundary, in floor-plan space.
   */
  clearPolygon: Point[]
  /**
   * The mirror of `clearPolygon`: the centerline `polygon` offset outward by each
   * bounding wall's half effective thickness, tracing the outer wall faces (the gross-area
   * boundary), in floor-plan space.
   */
  outerPolygon: Point[]
  /** Clear (thickness-aware) floor area, in squared millimeters. */
  area: number
  /** Sorted, unique ids of the walls that enclose the room. */
  wallIds: string[]
  /**
   * User-entered display name merged in from a stored `RoomOverride`. Absent on a
   * freshly derived room; single-sourced with `RoomSceneNode.name` in a later task.
   */
  name?: string
  /**
   * Ceiling height in millimeters merged in from a stored `RoomOverride`. Absent on a
   * freshly derived room, where the host floor's `defaultCeilingHeight` applies instead.
   */
  ceilingHeight?: number
  /**
   * Interior void rings, each a closed ring of corner points in floor-plan space,
   * in the same frame as `polygon`. Present only on a room that contains a
   * free-standing inner loop (a courtyard, light well, or chimney mass); a room
   * with no interior void omits the field entirely.
   */
  holes?: Point[][]
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
  if (override.ceilingHeight !== undefined) merged.ceilingHeight = override.ceilingHeight
  if (override.customPolygon !== undefined) {
    merged.polygon = override.customPolygon
    // Copy so `polygon` and `clearPolygon` are not the same array; a later mutation
    // of one must not silently alter the other.
    merged.clearPolygon = [...override.customPolygon]
    // A custom polygon has no per-edge thickness, so the outer boundary mirrors the
    // clear one: a fresh copy of the custom polygon, for the same reason.
    merged.outerPolygon = [...override.customPolygon]
    merged.area = Math.abs(polygonArea(override.customPolygon))
  }
  return merged
}

/**
 * Derive rooms from a set of walls by enumerating the bounded faces of the wall
 * graph. See the design specification, section 3.2 ("Rooms are derived from wall
 * topology"). Each closed loop of walls becomes one room.
 */
export function deriveRooms(walls: readonly Wall[], options?: { tolerance?: number }): Room[] {
  const graph = buildWallGraph(walls, options)
  const thicknessByWallId = new Map(walls.map((wall) => [wall.id, effectiveWallThickness(wall)]))
  return roomsOfGraph(graph, thicknessByWallId)
}
