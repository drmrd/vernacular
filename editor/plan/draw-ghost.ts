import type { Point } from '../../core'
import type { PlanDrawingContext, PreviewSegment } from './draw-plan'
import type { PlanPalette } from './plan-palette'
import { worldToScreen, type Viewport } from './viewport'

const GHOST_LINE_WIDTH = 2
const GHOST_LINE_CAP = 'round' as const

/** Paint each ghost segment as a faint overlay between its projected screen endpoints; no-ops when absent or empty. */
export function drawGhost(
  ctx: PlanDrawingContext,
  ghost: readonly PreviewSegment[] | undefined,
  render: { viewport: Viewport; palette: PlanPalette },
): void {
  const color = render.palette.ghost
  for (const segment of ghost ?? []) {
    const start = worldToScreen(segment.start, render.viewport)
    const end = worldToScreen(segment.end, render.viewport)
    strokeGhostSegment(ctx, { start, end }, color)
  }
}

function strokeGhostSegment(
  ctx: PlanDrawingContext,
  segment: { start: Point; end: Point },
  color: string,
): void {
  ctx.lineCap = GHOST_LINE_CAP
  ctx.lineWidth = GHOST_LINE_WIDTH
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(segment.start.x, segment.start.y)
  ctx.lineTo(segment.end.x, segment.end.y)
  ctx.stroke()
}
