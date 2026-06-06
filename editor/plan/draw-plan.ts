import type { Point, RoomSceneNode, WallSceneNode } from '../../core'
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
  closePath(): void
  stroke(): void
  fill(): void
}

export interface PreviewSegment {
  start: Point
  end: Point
}

export interface DrawPlanOptions {
  walls: WallSceneNode[]
  viewport: Viewport
  width: number
  height: number
  selectedIds: ReadonlySet<string>
  preview?: PreviewSegment
  rooms?: readonly RoomSceneNode[]
}

// Subtle floor tint that must stay readable beneath the dark wall strokes.
const ROOM_FILL_COLOR = '#eef2f6'
const WALL_COLOR = '#222222'
const SELECTED_WALL_COLOR = '#1a7fd4'
const PREVIEW_COLOR = '#5b9bd5'
const MIN_WALL_PIXELS = 1
const PREVIEW_LINE_WIDTH = 2
const START_MARKER_RADIUS = 4
const FULL_CIRCLE = Math.PI * 2
const LINE_CAP = 'round' as const

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  // Fill rooms first so wall strokes render on top of them.
  for (const room of options.rooms ?? []) {
    drawRoom(ctx, room, options.viewport)
  }
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
  if (options.preview) {
    drawPreview(ctx, options.preview, options.viewport)
  }
}

function drawRoom(ctx: PlanDrawingContext, room: RoomSceneNode, viewport: Viewport): void {
  const [firstPoint, ...remainingPoints] = room.polygon
  if (firstPoint === undefined || remainingPoints.length < 2) {
    return
  }
  const start = worldToScreen(firstPoint, viewport)
  ctx.fillStyle = ROOM_FILL_COLOR
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  for (const point of remainingPoints) {
    const screenPoint = worldToScreen(point, viewport)
    ctx.lineTo(screenPoint.x, screenPoint.y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawWall(ctx: PlanDrawingContext, wall: WallSceneNode, options: DrawPlanOptions): void {
  const from = worldToScreen(wall.start, options.viewport)
  const to = worldToScreen(wall.end, options.viewport)
  ctx.lineCap = LINE_CAP
  ctx.lineWidth = Math.max(MIN_WALL_PIXELS, wall.thickness * options.viewport.scale)
  ctx.strokeStyle = options.selectedIds.has(wall.id) ? SELECTED_WALL_COLOR : WALL_COLOR
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function drawPreview(ctx: PlanDrawingContext, preview: PreviewSegment, viewport: Viewport): void {
  const start = worldToScreen(preview.start, viewport)
  const end = worldToScreen(preview.end, viewport)
  drawPreviewLine(ctx, start, end)
  drawStartMarker(ctx, start)
}

function drawPreviewLine(ctx: PlanDrawingContext, start: Point, end: Point): void {
  ctx.lineCap = LINE_CAP
  ctx.lineWidth = PREVIEW_LINE_WIDTH
  ctx.strokeStyle = PREVIEW_COLOR
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
}

function drawStartMarker(ctx: PlanDrawingContext, center: Point): void {
  ctx.fillStyle = PREVIEW_COLOR
  ctx.beginPath()
  ctx.arc(center.x, center.y, START_MARKER_RADIUS, 0, FULL_CIRCLE)
  ctx.fill()
}
