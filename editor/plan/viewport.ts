import type { Point } from '../../core'

/** Pixels per millimeter. Chosen so a typical room fits the fixed proof-of-life Canvas. */
export const DEFAULT_PLAN_SCALE = 0.08
/** Far zoom-out floor: roughly 1 m spans 2 px. */
export const MIN_PLAN_SCALE = 0.002
/** Close zoom-in ceiling: 1 mm spans 4 px. */
export const MAX_PLAN_SCALE = 4

export interface ScreenPoint {
  x: number
  y: number
}

export interface ViewportSize {
  width: number
  height: number
}

/** Pan is a screen-pixel translation of the world origin. An absent offset means the world origin maps to the screen origin (no pan). */
export interface Viewport {
  scale: number
  offset?: ScreenPoint
}

const ORIGIN: ScreenPoint = { x: 0, y: 0 }
const offsetOf = (viewport: Viewport): ScreenPoint => viewport.offset ?? ORIGIN

export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint {
  const offset = offsetOf(viewport)
  return { x: point.x * viewport.scale + offset.x, y: point.y * viewport.scale + offset.y }
}

export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point {
  const offset = offsetOf(viewport)
  return { x: (screen.x - offset.x) / viewport.scale, y: (screen.y - offset.y) / viewport.scale }
}

export function panBy(viewport: Viewport, deltaPx: ScreenPoint): Viewport {
  const offset = offsetOf(viewport)
  return { ...viewport, offset: { x: offset.x + deltaPx.x, y: offset.y + deltaPx.y } }
}

export function clampScale(scale: number): number {
  return Math.min(MAX_PLAN_SCALE, Math.max(MIN_PLAN_SCALE, scale))
}

/** Zoom about the cursor. `factor > 1` zooms in, `factor < 1` zooms out; the resulting scale is clamped to `[MIN_PLAN_SCALE, MAX_PLAN_SCALE]`. */
export function zoomAtCursor(viewport: Viewport, cursor: ScreenPoint, factor: number): Viewport {
  const scale = clampScale(viewport.scale * factor)
  // Pin the world point under the cursor using the OLD (pre-clamp) viewport, then re-derive the offset so that point stays under the cursor after the scale changes.
  const worldUnder = screenToWorld(cursor, viewport)
  return {
    scale,
    offset: { x: cursor.x - worldUnder.x * scale, y: cursor.y - worldUnder.y * scale },
  }
}
