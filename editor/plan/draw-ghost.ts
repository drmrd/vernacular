import type { Point } from '../../core'
import type { PlanDrawingContext, PreviewSegment } from './draw-plan'
import { worldToScreen, type Viewport } from './viewport'

// Translucent gray-blue so the ghost reads as a faint overlay distinct from walls and the preview.
const GHOST_STROKE_COLOR = 'rgba(91, 155, 213, 0.5)'
const GHOST_LINE_WIDTH = 2
const GHOST_LINE_CAP = 'round' as const

/** Paint each ghost segment as a faint overlay between its projected screen endpoints; no-ops when absent or empty. */
export function drawGhost(
  ctx: PlanDrawingContext,
  ghost: readonly PreviewSegment[] | undefined,
  viewport: Viewport,
): void {
  for (const segment of ghost ?? []) {
    const start = worldToScreen(segment.start, viewport)
    const end = worldToScreen(segment.end, viewport)
    strokeGhostSegment(ctx, start, end)
  }
}

function strokeGhostSegment(ctx: PlanDrawingContext, start: Point, end: Point): void {
  ctx.lineCap = GHOST_LINE_CAP
  ctx.lineWidth = GHOST_LINE_WIDTH
  ctx.strokeStyle = GHOST_STROKE_COLOR
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
}
