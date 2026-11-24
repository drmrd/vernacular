import type { Point, Wall } from '../model/types'
import { distance, rotatePoint, translatePoint } from './point'
import { dot, leftPerp, shift, subtract, unit } from './vector'

export interface LinePath {
  readonly kind: 'line'
  readonly start: Point
  readonly end: Point
}

export type WallPath = LinePath

export function linePath(start: Point, end: Point): LinePath {
  return Object.freeze({
    kind: 'line',
    start: Object.freeze({ x: start.x, y: start.y }),
    end: Object.freeze({ x: end.x, y: end.y }),
  })
}

export function wallPath(wall: Pick<Wall, 'start' | 'end'>): WallPath {
  return linePath(wall.start, wall.end)
}

export function pathStart(path: WallPath): Point {
  return path.start
}

export function pathEnd(path: WallPath): Point {
  return path.end
}

export function pathLength(path: WallPath): number {
  return distance(path.start, path.end)
}

export function pointAlong(path: WallPath, alongMm: number): Point {
  return shift(path.start, unit(subtract(path.end, path.start)), alongMm)
}

// The distance is unused for a line; an arc will use it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tangentAlong(path: WallPath, _alongMm: number): Point {
  return unit(subtract(path.end, path.start))
}

export function normalAlong(path: WallPath, alongMm: number): Point {
  return leftPerp(tangentAlong(path, alongMm))
}

export interface PathProjection {
  /** The nearest point on the path. */
  readonly point: Point
  /** Distance along the path, clamped to its ends. */
  readonly along: number
  /**
   * Signed distance from the path's line, positive on the normal's side. Not clamped: for the
   * distance to the path, measure to point.
   */
  readonly offset: number
}

export function projectOntoPath(path: WallPath, point: Point): PathProjection {
  const fromStart = subtract(point, path.start)
  const unclampedAlong = dot(fromStart, tangentAlong(path, 0))
  const offset = dot(fromStart, normalAlong(path, unclampedAlong))
  const along = Math.max(0, Math.min(unclampedAlong, pathLength(path)))
  return { point: pointAlong(path, along), along, offset }
}

export function subPath(path: WallPath, fromMm: number, toMm: number): WallPath {
  return linePath(pointAlong(path, fromMm), pointAlong(path, toMm))
}

export function offsetPath(path: WallPath, offsetMm: number): WallPath {
  const normal = normalAlong(path, 0)
  return linePath(shift(path.start, normal, offsetMm), shift(path.end, normal, offsetMm))
}

export function translatePath(path: WallPath, delta: Point): WallPath {
  return linePath(translatePoint(path.start, delta), translatePoint(path.end, delta))
}

export function rotatePath(path: WallPath, pivot: Point, radians: number): WallPath {
  return linePath(rotatePoint(path.start, pivot, radians), rotatePoint(path.end, pivot, radians))
}

export function reversePath(path: WallPath): WallPath {
  return linePath(path.end, path.start)
}

// The deviation is unused for a line; an arc will use it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function flattenPath(path: WallPath, _maxDeviationMm: number): Point[] {
  return [path.start, path.end]
}

export interface PathBounds {
  readonly min: Point
  readonly max: Point
}

export function pathBounds(path: WallPath): PathBounds {
  return {
    min: { x: Math.min(path.start.x, path.end.x), y: Math.min(path.start.y, path.end.y) },
    max: { x: Math.max(path.start.x, path.end.x), y: Math.max(path.start.y, path.end.y) },
  }
}
