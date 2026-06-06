import type { Point } from '../../core'

import { clampScale, MAX_PLAN_SCALE, type Viewport, type ViewportSize } from './viewport'

export interface Bounds {
  min: Point
  max: Point
}

const DEFAULT_FIT_PADDING_PX = 24

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
    Math.min(
      worldWidth > 0 ? availableWidth / worldWidth : MAX_PLAN_SCALE,
      worldHeight > 0 ? availableHeight / worldHeight : MAX_PLAN_SCALE,
    ),
  )
  const centerX = (bounds.min.x + bounds.max.x) / 2
  const centerY = (bounds.min.y + bounds.max.y) / 2
  return {
    scale,
    offset: { x: size.width / 2 - centerX * scale, y: size.height / 2 - centerY * scale },
  }
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
