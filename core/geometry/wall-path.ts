import type { Point, Wall } from '../model/types'

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
