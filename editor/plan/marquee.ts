import {
  pointInPolygon,
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

/**
 * Liang-Barsky clip: true when segment `a`-`b` shares any point with `rect`,
 * including a single touch on its edge. A zero-length segment reduces to a
 * point-in-rect test.
 */
function segmentCrossesRect(a: Point, b: Point, rect: Bounds): boolean {
  const delta = { x: b.x - a.x, y: b.y - a.y }
  const edges: { numerator: number; direction: number }[] = [
    { numerator: a.x - rect.min.x, direction: -delta.x },
    { numerator: rect.max.x - a.x, direction: delta.x },
    { numerator: a.y - rect.min.y, direction: -delta.y },
    { numerator: rect.max.y - a.y, direction: delta.y },
  ]
  let enter = 0
  let exit = 1
  for (const { numerator, direction } of edges) {
    if (direction === 0) {
      if (numerator < 0) return false
      continue
    }
    const t = numerator / direction
    if (direction < 0) enter = Math.max(enter, t)
    else exit = Math.min(exit, t)
  }
  return enter <= exit
}

function rectCorners(rect: Bounds): Point[] {
  return [
    { x: rect.min.x, y: rect.min.y },
    { x: rect.max.x, y: rect.min.y },
    { x: rect.max.x, y: rect.max.y },
    { x: rect.min.x, y: rect.max.y },
  ]
}

/**
 * True when `polygon` shares any area with `rect`: an edge crosses it, or the
 * rectangle lies entirely within the polygon (no edge crosses, but a corner is
 * enclosed).
 */
function polygonCrossesRect(polygon: readonly Point[], rect: Bounds): boolean {
  const edgeCrosses = polygon.some((vertex, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return next !== undefined && segmentCrossesRect(vertex, next, rect)
  })
  return edgeCrosses || rectCorners(rect).some((corner) => pointInPolygon(corner, polygon))
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

function wallCrosses(wall: WallSceneNode, rect: Bounds): boolean {
  return segmentCrossesRect(wall.start, wall.end, rect)
}

function dimensionCrosses(dimension: DimensionSceneNode, rect: Bounds): boolean {
  return segmentCrossesRect(dimension.start, dimension.end, rect)
}

/**
 * Crossing (intersect) selection: the ids of every wall, room, opening, and
 * dimension that shares any area with `rect`, including the ones only partially
 * inside. This is the right-to-left counterpart to the window selection of
 * `entitiesInRect`.
 */
export function entitiesCrossingRect(scene: SceneGraph, rect: Bounds): string[] {
  const walls = scene.walls.filter((wall) => wallCrosses(wall, rect)).map((wall) => wall.id)
  const rooms = scene.rooms
    .filter((room) => polygonCrossesRect(room.polygon, rect))
    .map((room) => room.id)
  const openings = scene.openings
    .filter((opening) => polygonCrossesRect(openingCorners(opening), rect))
    .map((opening) => opening.id)
  const dimensions = scene.dimensions
    .filter((dimension) => dimensionCrosses(dimension, rect))
    .map((dimension) => dimension.id)
  return [...walls, ...rooms, ...openings, ...dimensions]
}
