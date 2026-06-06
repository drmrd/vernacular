import type { Point, RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'
import type { Bounds } from './fit'

/** A point lies in the rectangle; points on the edges count as contained. */
function pointInRect(point: Point, rect: Bounds): boolean {
  return (
    point.x >= rect.min.x && point.x <= rect.max.x && point.y >= rect.min.y && point.y <= rect.max.y
  )
}

function wallContained(wall: WallSceneNode, rect: Bounds): boolean {
  return pointInRect(wall.start, rect) && pointInRect(wall.end, rect)
}

function roomContained(room: RoomSceneNode, rect: Bounds): boolean {
  return room.polygon.every((vertex) => pointInRect(vertex, rect))
}

/**
 * Window (contained) selection: the ids of walls whose both endpoints and rooms
 * whose every vertex lie inside `rect`. Partially overlapping entities are
 * excluded; crossing selection is deferred to a later editing slice.
 */
export function entitiesInRect(scene: SceneGraph, rect: Bounds): string[] {
  const walls = scene.walls.filter((wall) => wallContained(wall, rect)).map((wall) => wall.id)
  const rooms = scene.rooms.filter((room) => roomContained(room, rect)).map((room) => room.id)
  return [...walls, ...rooms]
}
