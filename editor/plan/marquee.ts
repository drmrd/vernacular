import {
  type DimensionSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type WallSceneNode,
} from '../../core'
import type { Bounds } from './fit'
import { openingCorners } from './opening-geometry'

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

function openingContained(opening: OpeningSceneNode, rect: Bounds): boolean {
  return openingCorners(opening).every((corner) => pointInRect(corner, rect))
}

function dimensionContained(dimension: DimensionSceneNode, rect: Bounds): boolean {
  return pointInRect(dimension.start, rect) && pointInRect(dimension.end, rect)
}

/**
 * Window (contained) selection: the ids of walls whose both endpoints and rooms
 * whose every vertex lie inside `rect`. Partially overlapping entities are
 * excluded; crossing selection is deferred to a later editing slice.
 */
export function entitiesInRect(scene: SceneGraph, rect: Bounds): string[] {
  const walls = scene.walls.filter((wall) => wallContained(wall, rect)).map((wall) => wall.id)
  const rooms = scene.rooms.filter((room) => roomContained(room, rect)).map((room) => room.id)
  const openings = scene.openings
    .filter((opening) => openingContained(opening, rect))
    .map((opening) => opening.id)
  const dimensions = scene.dimensions
    .filter((dimension) => dimensionContained(dimension, rect))
    .map((dimension) => dimension.id)
  return [...walls, ...rooms, ...openings, ...dimensions]
}
