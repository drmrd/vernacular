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

/** Project a world point to screen pixels. World y increases upward (the file's y-up convention) while screen y increases downward, so the vertical axis is negated. */
export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint {
  const offset = offsetOf(viewport)
  return { x: point.x * viewport.scale + offset.x, y: -point.y * viewport.scale + offset.y }
}

/** Inverse of `worldToScreen`. Recovers world coordinates from a screen pixel, undoing the vertical y-up negation. */
export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point {
  const offset = offsetOf(viewport)
  return { x: (screen.x - offset.x) / viewport.scale, y: (offset.y - screen.y) / viewport.scale }
}

export function panBy(viewport: Viewport, deltaPx: ScreenPoint): Viewport {
  const offset = offsetOf(viewport)
  return { ...viewport, offset: { x: offset.x + deltaPx.x, y: offset.y + deltaPx.y } }
}

export function clampScale(scale: number): number {
  return Math.min(MAX_PLAN_SCALE, Math.max(MIN_PLAN_SCALE, scale))
}

/** The viewport scale as a whole-number percentage of the default scale, so the initial view reads 100%. */
export function zoomPercent(scale: number): number {
  return Math.round((scale / DEFAULT_PLAN_SCALE) * 100)
}

/** How sharply wheel deltas translate into zoom. Tuned so a typical notched scroll feels gradual. */
const ZOOM_WHEEL_SENSITIVITY = 0.0015

/** Map a wheel `deltaY` to a multiplicative zoom factor. Exponential so the factor is continuous and symmetric in log-space; an upward scroll (negative `deltaY`) returns `> 1` (zoom in), a downward scroll returns `< 1`. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY)
}

/** Zoom about the cursor. `factor > 1` zooms in, `factor < 1` zooms out; the resulting scale is clamped to `[MIN_PLAN_SCALE, MAX_PLAN_SCALE]`. */
export function zoomAtCursor(viewport: Viewport, cursor: ScreenPoint, factor: number): Viewport {
  const scale = clampScale(viewport.scale * factor)
  // Pin the world point under the cursor using the OLD (pre-clamp) viewport, then re-derive the offset so that point stays under the cursor after the scale changes.
  const worldUnder = screenToWorld(cursor, viewport)
  return {
    scale,
    offset: { x: cursor.x - worldUnder.x * scale, y: cursor.y + worldUnder.y * scale },
  }
}

/** The one-dimensional affine map `screen = world * scale + translate` for a single axis, as consumed by `axisSamples`. The horizontal axis uses the positive viewport scale; the vertical axis negates it to mirror the y-up sign flip in `worldToScreen`, so the scale field already incorporates any axis sign flip. */
export interface AxisProjection {
  scale: number
  translate: number
}

/**
 * Reduce a viewport to the affine projection of one axis: horizontal uses the x offset, vertical the y.
 *
 * The vertical case negates the viewport scale so it mirrors the y-up negation in `worldToScreen`:
 * world y increases upward while screen y increases downward.
 */
export function axisProjection(
  viewport: Viewport,
  orientation: 'horizontal' | 'vertical',
): AxisProjection {
  const offset = offsetOf(viewport)
  const horizontal = orientation === 'horizontal'
  return {
    scale: horizontal ? viewport.scale : -viewport.scale,
    translate: horizontal ? offset.x : offset.y,
  }
}

/** A grid line along one axis: its world coordinate and the screen pixel it projects to. */
export interface AxisSample {
  worldValue: number
  screen: number
}

/** Step world multiples of `spacingMm` across the visible `[0, lengthPx]` screen range, projecting each to screen pixels. `spacingMm` must be a positive world distance; a non-positive value would never advance the loop or would walk away from `high`. */
export function axisSamples(
  projection: AxisProjection,
  lengthPx: number,
  spacingMm: number,
): AxisSample[] {
  const { scale, translate } = projection
  const worldAtStart = (0 - translate) / scale
  const worldAtEnd = (lengthPx - translate) / scale
  const low = Math.min(worldAtStart, worldAtEnd)
  const high = Math.max(worldAtStart, worldAtEnd)
  const samples: AxisSample[] = []
  for (let world = Math.ceil(low / spacingMm) * spacingMm; world <= high; world += spacingMm) {
    samples.push({ worldValue: world, screen: world * scale + translate })
  }
  return samples
}
