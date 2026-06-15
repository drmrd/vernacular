import type { Point } from '../../core'

import { clampScale, MAX_PLAN_SCALE, type Viewport, type ViewportSize } from './viewport'

export interface Bounds {
  min: Point
  max: Point
}

const DEFAULT_FIT_PADDING_PX = 24

/** Pixels-per-world-unit that fits `worldExtent` into `availablePx`; a degenerate (non-positive) extent falls back to the tightest zoom so the other axis governs the fit. */
function scaleForAxis(worldExtent: number, availablePx: number): number {
  return worldExtent > 0 ? availablePx / worldExtent : MAX_PLAN_SCALE
}

export function computeFitViewport(
  bounds: Bounds,
  size: ViewportSize,
  paddingPx: number = DEFAULT_FIT_PADDING_PX,
): Viewport {
  const worldWidth = bounds.max.x - bounds.min.x
  const worldHeight = bounds.max.y - bounds.min.y
  const availableWidth = size.width - 2 * paddingPx
  const availableHeight = size.height - 2 * paddingPx
  const scale = clampScale(
    Math.min(scaleForAxis(worldWidth, availableWidth), scaleForAxis(worldHeight, availableHeight)),
  )
  const centerX = (bounds.min.x + bounds.max.x) / 2
  const centerY = (bounds.min.y + bounds.max.y) / 2
  // Fitting always centers the content, so we always materialize a concrete `offset`; the optional `Viewport.offset` no-pan sentinel never applies to a fit viewport.
  return {
    scale,
    offset: { x: size.width / 2 - centerX * scale, y: size.height / 2 - centerY * scale },
  }
}

/** The bounding size of the drawn plan in world millimeters. */
export interface PlanExtent {
  width: number
  height: number
}

/**
 * The overall width and height of everything drawn on a floor: the wall endpoints
 * and the room polygons. Returns null when nothing is drawn, so a caller can drop
 * the readout on an empty plan rather than reporting a zero size.
 */
export function planExtent(
  walls: readonly { start: Point; end: Point }[],
  rooms: readonly { polygon: readonly Point[] }[],
): PlanExtent | null {
  const bounds = contentBounds([
    ...walls.flatMap((wall) => [wall.start, wall.end]),
    ...rooms.flatMap((room) => room.polygon),
  ])
  if (bounds === null) {
    return null
  }
  return { width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y }
}

export function contentBounds(points: readonly Point[]): Bounds | null {
  const [first, ...rest] = points
  if (first === undefined) {
    return null
  }
  let minX = first.x
  let minY = first.y
  let maxX = first.x
  let maxY = first.y
  for (const point of rest) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}
