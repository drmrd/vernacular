import {
  DEFAULT_METRIC_PREFERENCES,
  type Point,
  type RoomSceneNode,
  type UnitPreferences,
  type WallSceneNode,
} from '../../core'
import { drawDimension, type DrawableDimension } from './draw-dimension'
import { drawGhost } from './draw-ghost'
import { drawOpening, type DrawableOpening } from './draw-opening'
import { drawUnderlays, drawCalibration, type DrawableUnderlay } from './draw-underlay'
import type { Bounds } from './fit'
import { visibleGridLines } from './grid'
import { roomLabelContent, type RoomLabelOptions } from './room-label'
import { drawRulers } from './ruler'
import type { SnapResult } from './snap'
import { worldToScreen, type Viewport, type ViewportSize } from './viewport'

export { drawRulers } from './ruler'

export interface PlanDrawingContext {
  lineWidth: number
  lineCap: CanvasLineCap
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha: number
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
  drawImage(image: CanvasImageSource, dx: number, dy: number, dWidth: number, dHeight: number): void
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
  roomLabels?: RoomLabelOptions
  underlays?: readonly DrawableUnderlay[]
  openings?: readonly DrawableOpening[]
  dimensions?: readonly DrawableDimension[]
  calibration?: PreviewSegment
  ghost?: readonly PreviewSegment[]
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
const SNAP_MARKER_COLOR = '#f08c00'
const SNAP_MARKER_RADIUS_PX = 5
const SNAP_MARKER_LINE_WIDTH = 2
const ENDPOINT_HANDLE_COLOR = '#1a7fd4'
const ENDPOINT_HANDLE_RADIUS_PX = 5
const MARQUEE_FILL_COLOR = 'rgba(26, 127, 212, 0.12)'
const MARQUEE_STROKE_COLOR = '#1a7fd4'
const MARQUEE_LINE_WIDTH = 1
const LABEL_COLOR = '#37414d'
const LABEL_FONT = '12px sans-serif'
const LABEL_TEXT_ALIGN = 'center' as const
const LABEL_TEXT_BASELINE = 'middle' as const
const LABEL_LINE_HEIGHT = 14

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
  // Underlays paint first so they sit beneath the grid and the plan.
  drawUnderlays(ctx, options.underlays, options.viewport)
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
  // Openings break the wall stroke, so they paint after the walls.
  drawOpenings(ctx, options)
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
  drawRoomLabels(ctx, options)
  // Dimensions are annotation overlays above the plan but below the ruler chrome.
  drawDimensions(ctx, options)
  // Calibration sits above the plan but below the rulers.
  drawCalibration(ctx, options.calibration, options.viewport)
  // The move-drag ghost sits above the plan but below the rulers, like the preview.
  drawGhost(ctx, options.ghost, options.viewport)
  if (options.rulers) {
    drawPlanRulers(ctx, options, size)
  }
}

/** Paint the ruler chrome in the project's units so it agrees with the DOM overlay. */
function drawPlanRulers(
  ctx: PlanDrawingContext,
  options: DrawPlanOptions,
  size: ViewportSize,
): void {
  const preferences = options.roomLabels?.preferences ?? DEFAULT_METRIC_PREFERENCES
  drawRulers(ctx, options.viewport, size, preferences)
}

/** Paint each opening's plan symbol over the wall stroke it breaks. */
function drawOpenings(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  for (const opening of options.openings ?? []) {
    drawOpening(ctx, opening, options.viewport)
  }
}

/** Paint each dimension as an annotation overlay above the plan. */
function drawDimensions(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const preferences = options.roomLabels?.preferences ?? DEFAULT_METRIC_PREFERENCES
  for (const dimension of options.dimensions ?? []) {
    drawDimension(ctx, dimension, options.viewport, preferences)
  }
}

/** Paint every room's label as an overlay above the fills and wall strokes so the text reads on top. */
function drawRoomLabels(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const roomLabels = options.roomLabels
  if (roomLabels === undefined) {
    return
  }
  for (const room of options.rooms ?? []) {
    drawRoomLabel(ctx, room, {
      viewport: options.viewport,
      preferences: roomLabels.preferences,
    })
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

/** Paint a room's name and area at its centroid; the area drops below a present name. */
export function drawRoomLabel(
  ctx: PlanDrawingContext,
  room: RoomSceneNode,
  options: { viewport: Viewport; preferences: UnitPreferences },
): void {
  const content = roomLabelContent(room, { preferences: options.preferences })
  const anchor = worldToScreen(content.anchor, options.viewport)
  ctx.font = LABEL_FONT
  ctx.fillStyle = LABEL_COLOR
  ctx.textAlign = LABEL_TEXT_ALIGN
  ctx.textBaseline = LABEL_TEXT_BASELINE
  if (content.name === undefined) {
    ctx.fillText(content.area, anchor.x, anchor.y)
    return
  }
  ctx.fillText(content.name, anchor.x, anchor.y)
  ctx.fillText(content.area, anchor.x, anchor.y + LABEL_LINE_HEIGHT)
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
