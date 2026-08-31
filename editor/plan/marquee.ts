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

interface EntityHits {
  wall: (wall: WallSceneNode) => boolean
  room: (room: RoomSceneNode) => boolean
  opening: (opening: OpeningSceneNode) => boolean
  dimension: (dimension: DimensionSceneNode) => boolean
}

/** Collect the ids of every entity whose per-kind predicate accepts it, in wall-room-opening-dimension order. */
function selectEntities(scene: SceneGraph, hits: EntityHits): string[] {
  return [
    ...scene.walls.filter((wall) => hits.wall(wall)).map((wall) => wall.id),
    ...scene.rooms.filter((room) => hits.room(room)).map((room) => room.id),
    ...scene.openings.filter((opening) => hits.opening(opening)).map((opening) => opening.id),
    ...scene.dimensions
      .filter((dimension) => hits.dimension(dimension))
      .map((dimension) => dimension.id),
  ]
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
 * excluded; crossing selection is deferred to a later editing slice. When
 * `options.dimensionsVisible` is `false`, every dimension is excluded from the
 * result regardless of containment.
 */
export function entitiesInRect(
  scene: SceneGraph,
  rect: Bounds,
  options?: { dimensionsVisible?: boolean },
): string[] {
  const dimensionsVisible = options?.dimensionsVisible ?? true
  return selectEntities(scene, {
    wall: (wall) => wallContained(wall, rect),
    room: (room) => roomContained(room, rect),
    opening: (opening) => openingContained(opening, rect),
    dimension: (dimension) => dimensionsVisible && dimensionContained(dimension, rect),
  })
}

/**
 * Crossing (intersect) selection: the ids of every wall, room, opening, and
 * dimension that shares any area with `rect`, including the ones only partially
 * inside. This is the right-to-left counterpart to the window selection of
 * `entitiesInRect`. When `options.dimensionsVisible` is `false`, every
 * dimension is excluded from the result regardless of crossing.
 */
export function entitiesCrossingRect(
  scene: SceneGraph,
  rect: Bounds,
  options?: { dimensionsVisible?: boolean },
): string[] {
  const dimensionsVisible = options?.dimensionsVisible ?? true
  return selectEntities(scene, {
    wall: (wall) => segmentCrossesRect(wall.start, wall.end, rect),
    room: (room) => polygonCrossesRect(room.polygon, rect),
    opening: (opening) => polygonCrossesRect(openingCorners(opening), rect),
    dimension: (dimension) =>
      dimensionsVisible && segmentCrossesRect(dimension.start, dimension.end, rect),
  })
}
