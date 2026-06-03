import type { Point } from '../../core'

/** Pixels per millimeter. Chosen so a typical room fits the fixed proof-of-life Canvas. */
export const DEFAULT_PLAN_SCALE = 0.08

export interface Viewport {
  scale: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint {
  return { x: point.x * viewport.scale, y: point.y * viewport.scale }
}

export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point {
  return { x: screen.x / viewport.scale, y: screen.y / viewport.scale }
}
