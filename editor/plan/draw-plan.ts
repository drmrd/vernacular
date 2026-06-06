import type { Point, RoomSceneNode, WallSceneNode } from '../../core'
import type { Bounds } from './fit'
import { visibleGridLines } from './grid'
import { rulerTicks, RULER_THICKNESS_PX } from './ruler'
import type { SnapResult } from './snap'
import { worldToScreen, type Viewport, type ViewportSize } from './viewport'

export interface PlanDrawingContext {
  lineWidth: number
  lineCap: CanvasLineCap
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  clearRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  closePath(): void
  stroke(): void
  fill(): void
  fillText(text: string, x: number, y: number): void
  fillRect(x: number, y: number, width: number, height: number): void
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
  grid?: boolean
  rulers?: boolean
  snap?: SnapResult
  marquee?: Bounds
  endpointHandles?: WallSceneNode
}

// Subtle floor tint that must stay readable beneath the dark wall strokes.
const ROOM_FILL_COLOR = '#eef2f6'
const SELECTED_ROOM_FILL_COLOR = '#dbeafe'
const SELECTED_ROOM_STROKE_COLOR = '#1a7fd4'
const SELECTED_ROOM_LINE_WIDTH = 2
const WALL_COLOR = '#222222'
const SELECTED_WALL_COLOR = '#1a7fd4'
const PREVIEW_COLOR = '#5b9bd5'
const MIN_WALL_PIXELS = 1
const PREVIEW_LINE_WIDTH = 2
const START_MARKER_RADIUS = 4
const FULL_CIRCLE = Math.PI * 2
const LINE_CAP = 'round' as const
const GRID_LINE_COLOR = '#e6e9ee'
const GRID_LINE_WIDTH = 1
const RULER_BAND_COLOR = '#f5f7fa'
const RULER_TICK_COLOR = '#c2c8d0'
const RULER_TEXT_COLOR = '#5a6470'
const RULER_FONT = '10px sans-serif'
const RULER_LABEL_INSET_PX = 2
const SNAP_MARKER_COLOR = '#f08c00'
const SNAP_MARKER_RADIUS_PX = 5
const SNAP_MARKER_LINE_WIDTH = 2
const ENDPOINT_HANDLE_COLOR = '#1a7fd4'
const ENDPOINT_HANDLE_RADIUS_PX = 5
const MARQUEE_FILL_COLOR = 'rgba(26, 127, 212, 0.12)'
const MARQUEE_STROKE_COLOR = '#1a7fd4'
const MARQUEE_LINE_WIDTH = 1

export function drawRulers(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void {
  ctx.fillStyle = RULER_BAND_COLOR
  ctx.fillRect(0, 0, size.width, RULER_THICKNESS_PX)
  ctx.fillRect(0, 0, RULER_THICKNESS_PX, size.height)
  // Both axes render with shared tick/text styles set once here; drawRulerTicks
  // relies on this state (strokeStyle, fillStyle, font, textAlign, textBaseline)
  // and never resets it per tick or per axis.
  ctx.strokeStyle = RULER_TICK_COLOR
  ctx.fillStyle = RULER_TEXT_COLOR
  ctx.font = RULER_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  drawRulerTicks(ctx, viewport, { orientation: 'horizontal', lengthPx: size.width })
  drawRulerTicks(ctx, viewport, { orientation: 'vertical', lengthPx: size.height })
}

function drawRulerTicks(
  ctx: PlanDrawingContext,
  viewport: Viewport,
  axis: { orientation: 'horizontal' | 'vertical'; lengthPx: number },
): void {
  const isHorizontal = axis.orientation === 'horizontal'
  for (const tick of rulerTicks(viewport, axis.lengthPx, axis.orientation)) {
    ctx.beginPath()
    if (isHorizontal) {
      ctx.moveTo(tick.screen, 0)
      ctx.lineTo(tick.screen, RULER_THICKNESS_PX)
    } else {
      ctx.moveTo(0, tick.screen)
      ctx.lineTo(RULER_THICKNESS_PX, tick.screen)
    }
    ctx.stroke()
    if (isHorizontal) {
      ctx.fillText(tick.label, tick.screen + RULER_LABEL_INSET_PX, RULER_LABEL_INSET_PX)
    } else {
      ctx.fillText(tick.label, RULER_LABEL_INSET_PX, tick.screen + RULER_LABEL_INSET_PX)
    }
  }
}

export function drawGrid(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void {
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = GRID_LINE_WIDTH
  for (const line of visibleGridLines(viewport, size).lines) {
    ctx.beginPath()
    if (line.orientation === 'vertical') {
      ctx.moveTo(line.screen, 0)
      ctx.lineTo(line.screen, size.height)
    } else {
      ctx.moveTo(0, line.screen)
      ctx.lineTo(size.width, line.screen)
    }
    ctx.stroke()
  }
}

/** Paints the rubber-band marquee at its screen position so it tracks pan and zoom. */
export function drawMarquee(ctx: PlanDrawingContext, rect: Bounds, viewport: Viewport): void {
  const min = worldToScreen(rect.min, viewport)
  const max = worldToScreen(rect.max, viewport)
  const width = max.x - min.x
  const height = max.y - min.y
  ctx.fillStyle = MARQUEE_FILL_COLOR
  ctx.fillRect(min.x, min.y, width, height)
  ctx.strokeStyle = MARQUEE_STROKE_COLOR
  ctx.lineWidth = MARQUEE_LINE_WIDTH
  ctx.beginPath()
  ctx.moveTo(min.x, min.y)
  ctx.lineTo(max.x, min.y)
  ctx.lineTo(max.x, max.y)
  ctx.lineTo(min.x, max.y)
  ctx.closePath()
  ctx.stroke()
}

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  const size = { width: options.width, height: options.height }
  if (options.grid) {
    drawGrid(ctx, options.viewport, size)
  }
  // Fill rooms first so wall strokes render on top of them.
  for (const room of options.rooms ?? []) {
    drawRoom(ctx, room, {
      viewport: options.viewport,
      selected: options.selectedIds.has(room.id),
    })
  }
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
  if (options.endpointHandles) {
    drawEndpointHandles(ctx, options.endpointHandles, options.viewport)
  }
  if (options.preview) {
    drawPreview(ctx, options.preview, options.viewport)
  }
  if (options.snap) {
    drawSnapIndicator(ctx, options.snap, options.viewport)
  }
  if (options.marquee) {
    drawMarquee(ctx, options.marquee, options.viewport)
  }
  if (options.rulers) {
    drawRulers(ctx, options.viewport, size)
  }
}

interface RoomDrawing {
  viewport: Viewport
  selected: boolean
}

function drawRoom(ctx: PlanDrawingContext, room: RoomSceneNode, drawing: RoomDrawing): void {
  const [firstPoint, ...remainingPoints] = room.polygon
  if (firstPoint === undefined || remainingPoints.length < 2) {
    return
  }
  const start = worldToScreen(firstPoint, drawing.viewport)
  ctx.fillStyle = drawing.selected ? SELECTED_ROOM_FILL_COLOR : ROOM_FILL_COLOR
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  for (const point of remainingPoints) {
    const screenPoint = worldToScreen(point, drawing.viewport)
    ctx.lineTo(screenPoint.x, screenPoint.y)
  }
  ctx.closePath()
  ctx.fill()
  if (drawing.selected) {
    ctx.strokeStyle = SELECTED_ROOM_STROKE_COLOR
    ctx.lineWidth = SELECTED_ROOM_LINE_WIDTH
    ctx.stroke()
  }
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

/** Paint a handle marker at the wall's start and end screen positions so they track pan and zoom. */
export function drawEndpointHandles(
  ctx: PlanDrawingContext,
  wall: WallSceneNode,
  viewport: Viewport,
): void {
  drawEndpointHandle(ctx, worldToScreen(wall.start, viewport))
  drawEndpointHandle(ctx, worldToScreen(wall.end, viewport))
}

function drawEndpointHandle(ctx: PlanDrawingContext, center: Point): void {
  ctx.fillStyle = ENDPOINT_HANDLE_COLOR
  ctx.beginPath()
  ctx.arc(center.x, center.y, ENDPOINT_HANDLE_RADIUS_PX, 0, FULL_CIRCLE)
  ctx.fill()
}

/** Paint a ring marker at the snapped point so the user sees where the next click lands. */
export function drawSnapIndicator(
  ctx: PlanDrawingContext,
  snap: SnapResult,
  viewport: Viewport,
): void {
  const center = worldToScreen(snap.point, viewport)
  ctx.strokeStyle = SNAP_MARKER_COLOR
  ctx.lineWidth = SNAP_MARKER_LINE_WIDTH
  ctx.beginPath()
  ctx.arc(center.x, center.y, SNAP_MARKER_RADIUS_PX, 0, FULL_CIRCLE)
  ctx.stroke()
}
