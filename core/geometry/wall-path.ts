import type { Point, Wall } from '../model/types'
import { distance } from './point'
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
  readonly point: Point
  readonly along: number
  readonly offset: number
}

export function projectOntoPath(path: WallPath, point: Point): PathProjection {
  const fromStart = subtract(point, path.start)
  const unclampedAlong = dot(fromStart, tangentAlong(path, 0))
  const offset = dot(fromStart, normalAlong(path, unclampedAlong))
  const along = Math.max(0, Math.min(unclampedAlong, pathLength(path)))
  return { point: pointAlong(path, along), along, offset }
}
