import type { Point, WallSceneNode } from '../../core'
import { worldToScreen, type Viewport } from './viewport'

export interface PlanDrawingContext {
  lineWidth: number
  lineCap: CanvasLineCap
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  clearRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  stroke(): void
  fill(): void
}

export interface DrawPlanOptions {
  walls: WallSceneNode[]
  viewport: Viewport
  width: number
  height: number
  selectedIds: ReadonlySet<string>
  preview?: { start: Point; end: Point }
}

const WALL_COLOR = '#222222'
const SELECTED_WALL_COLOR = '#1a7fd4'
const PREVIEW_COLOR = '#5b9bd5'
const MIN_WALL_PIXELS = 1
const PREVIEW_LINE_WIDTH = 2
const START_MARKER_RADIUS = 4
const FULL_CIRCLE = Math.PI * 2

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
  if (options.preview) {
    drawPreview(ctx, options.preview, options.viewport)
  }
}

function drawWall(ctx: PlanDrawingContext, wall: WallSceneNode, options: DrawPlanOptions): void {
  const from = worldToScreen(wall.start, options.viewport)
  const to = worldToScreen(wall.end, options.viewport)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(MIN_WALL_PIXELS, wall.thickness * options.viewport.scale)
  ctx.strokeStyle = options.selectedIds.has(wall.id) ? SELECTED_WALL_COLOR : WALL_COLOR
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function drawPreview(
  ctx: PlanDrawingContext,
  preview: { start: Point; end: Point },
  viewport: Viewport,
): void {
  const start = worldToScreen(preview.start, viewport)
  const end = worldToScreen(preview.end, viewport)
  ctx.lineCap = 'round'
  ctx.lineWidth = PREVIEW_LINE_WIDTH
  ctx.strokeStyle = PREVIEW_COLOR
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.fillStyle = PREVIEW_COLOR
  ctx.beginPath()
  ctx.arc(start.x, start.y, START_MARKER_RADIUS, 0, FULL_CIRCLE)
  ctx.fill()
}
