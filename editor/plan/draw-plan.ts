/* eslint-disable max-lines -- the cohesive plan-drawing seam: one small routine per drawable layer (rooms, walls, openings, dimensions, stairs, underlays, handles). Splitting it would scatter the PlanDrawingContext seam this module defines. */
import {
  DEFAULT_METRIC_PREFERENCES,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type StairSceneNode,
  type UnitPreferences,
  type WallSceneNode,
} from '../../core'
import { drawDimension, type DrawableDimension } from './draw-dimension'
import { drawFurniture, type DrawableFurniture } from './draw-furniture'
import { drawGhost } from './draw-ghost'
import { drawOpening, type DrawableOpening } from './draw-opening'
import { drawStair } from './draw-stair'
import { drawSurfacePaint, type SurfacePaintLayer } from './draw-surface-paint'
import { drawUnderlays, drawCalibration, type DrawableUnderlay } from './draw-underlay'
import { openingCorners, openingJambs } from './opening-geometry'
import type { Bounds } from './fit'
import { visibleGridLines } from './grid'
import { centerOf, layoutDimensionLabels, layoutRoomLabels } from './label-layout'
import { roomLabelContent, type RoomLabelOptions } from './room-label'
import { drawRulers } from './ruler'
import { DEFAULT_PLAN_PALETTE, type PlanPalette } from './plan-palette'
import type { SnapResult } from './snap'
import { worldToScreen, type Viewport } from './viewport'

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
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void
  closePath(): void
  stroke(): void
  fill(): void
  fillText(text: string, x: number, y: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dWidth: number, dHeight: number): void
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
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
  /** The opening whose two jamb resize handles paint over the wall, or absent for none. */
  openingResizeHandles?: OpeningSceneNode
  /** The id of the single entity to highlight as a hover preview, or absent for none. */
  hoveredId?: string
  roomLabels?: RoomLabelOptions
  underlays?: readonly DrawableUnderlay[]
  openings?: readonly DrawableOpening[]
  /** Placed furniture pieces drawn above the walls. */
  furniture?: readonly DrawableFurniture[]
  stairs?: readonly StairSceneNode[]
  dimensions?: readonly DrawableDimension[]
  calibration?: PreviewSegment
  ghost?: readonly PreviewSegment[]
  surfacePaint?: Pick<SurfacePaintLayer, 'treatmentForFace' | 'activeSurface'>
  /** The active floor's solid paint color; tints every room fill when set. */
  roomFillColor?: string
  /** The canvas color palette; defaults to the warm light-theme palette when absent. */
  palette?: PlanPalette
}

const SELECTED_ROOM_LINE_WIDTH = 2
const HOVER_HIGHLIGHT_LINE_WIDTH = 3
const MIN_WALL_PIXELS = 1
const PREVIEW_LINE_WIDTH = 2
const START_MARKER_RADIUS = 4
const FULL_CIRCLE = Math.PI * 2
const LINE_CAP = 'round' as const
const GRID_LINE_WIDTH = 1
const SNAP_MARKER_COLOR = '#f08c00'
const SNAP_MARKER_RADIUS_PX = 5
const SNAP_MARKER_LINE_WIDTH = 2
const ENDPOINT_HANDLE_RADIUS_PX = 5
const MARQUEE_LINE_WIDTH = 1
const LABEL_FONT = '12px sans-serif'
const LABEL_TEXT_ALIGN = 'center' as const
const LABEL_TEXT_BASELINE = 'middle' as const
const LABEL_LINE_HEIGHT = 14

// The canvas palette for this draw, from the options or the warm default.
function paletteOf(options: DrawPlanOptions): PlanPalette {
  return options.palette ?? DEFAULT_PLAN_PALETTE
}

export function drawGrid(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const size = { width: options.width, height: options.height }
  ctx.strokeStyle = paletteOf(options).grid
  ctx.lineWidth = GRID_LINE_WIDTH
  for (const line of visibleGridLines(options.viewport, size).lines) {
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
export function drawMarquee(ctx: PlanDrawingContext, rect: Bounds, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  const min = worldToScreen(rect.min, options.viewport)
  const max = worldToScreen(rect.max, options.viewport)
  const width = max.x - min.x
  const height = max.y - min.y
  ctx.fillStyle = palette.marqueeFill
  ctx.fillRect(min.x, min.y, width, height)
  ctx.strokeStyle = palette.selection
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
  // Underlays paint first so they sit beneath the grid and the plan.
  drawUnderlays(ctx, options.underlays, options.viewport)
  if (options.grid) drawGrid(ctx, options)
  drawRooms(ctx, options)
  // Stairs sit on top of the floor fills but below the wall strokes, like a room.
  drawStairs(ctx, options)
  // Surface paint bands sit beneath the wall strokes so the ink reads over them.
  drawSurfacePaintLayer(ctx, options)
  drawWalls(ctx, options)
  // Openings break the wall stroke, so they paint after the walls.
  drawOpenings(ctx, options)
  // Furniture sits above the wall/opening layer but below the interaction overlays.
  drawFurnitureLayer(ctx, options)
  if (options.endpointHandles) drawEndpointHandles(ctx, options.endpointHandles, options)
  if (options.openingResizeHandles)
    drawOpeningResizeHandles(ctx, options.openingResizeHandles, options.viewport)
  if (options.preview) drawPreview(ctx, options.preview, options)
  if (options.snap) drawSnapIndicator(ctx, options.snap, options.viewport)
  if (options.marquee) drawMarquee(ctx, options.marquee, options)
  drawRoomLabels(ctx, options)
  // Dimensions are annotation overlays above the plan but below the ruler chrome.
  drawDimensions(ctx, options)
  // Calibration sits above the plan but below the rulers.
  drawCalibration(ctx, options.calibration, options.viewport)
  // The move-drag ghost sits above the plan but below the rulers, like the preview.
  drawGhost(ctx, options.ghost, { viewport: options.viewport, palette: paletteOf(options) })
  // The hover cue paints on top of every entity layer but beneath the ruler chrome.
  drawHoverHighlight(ctx, options)
  if (options.rulers) drawRulers(ctx, options)
}

/** Outline the hovered entity in the single hover style, resolving the id across openings, walls, dimensions, then rooms. */
function drawHoverHighlight(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const hoveredId = options.hoveredId
  if (hoveredId === undefined) return
  const opening = options.openings?.find((candidate) => candidate.node.id === hoveredId)
  if (opening !== undefined) {
    strokeHoverRing(ctx, openingCorners(opening.node), options)
    return
  }
  const wall = options.walls.find((candidate) => candidate.id === hoveredId)
  if (wall !== undefined) {
    strokeHoverSegment(ctx, wall, options)
    return
  }
  const dimension = options.dimensions?.find((candidate) => candidate.node.id === hoveredId)
  if (dimension !== undefined) {
    strokeHoverSegment(ctx, dimension.node, options)
    return
  }
  const room = options.rooms?.find((candidate) => candidate.id === hoveredId)
  if (room !== undefined) {
    strokeHoverRing(ctx, room.polygon, options)
  }
}

/** Stroke a single hover-colored segment between a segment's two world endpoints. */
function strokeHoverSegment(
  ctx: PlanDrawingContext,
  segment: PreviewSegment,
  options: DrawPlanOptions,
): void {
  const from = worldToScreen(segment.start, options.viewport)
  const to = worldToScreen(segment.end, options.viewport)
  ctx.strokeStyle = paletteOf(options).hover
  ctx.lineWidth = HOVER_HIGHLIGHT_LINE_WIDTH
  ctx.lineCap = LINE_CAP
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

/** Stroke a single hover-colored outline of a closed ring. */
function strokeHoverRing(ctx: PlanDrawingContext, ring: Point[], options: DrawPlanOptions): void {
  ctx.strokeStyle = paletteOf(options).hover
  ctx.lineWidth = HOVER_HIGHLIGHT_LINE_WIDTH
  ctx.lineCap = LINE_CAP
  ctx.beginPath()
  traceRingPath(ctx, ring, options.viewport)
  ctx.stroke()
}

/** Paint each opening's plan symbol over the wall stroke it breaks. */
function drawOpenings(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  for (const opening of options.openings ?? []) {
    drawOpening(ctx, opening, { viewport: options.viewport, palette })
  }
}

/** Paint each placed furniture piece above the wall and opening layer. */
function drawFurnitureLayer(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  for (const piece of options.furniture ?? []) {
    drawFurniture(ctx, piece, { viewport: options.viewport, palette })
  }
}

/** Fill each room first so the wall strokes render on top of the floor tint. */
function drawRooms(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  for (const room of options.rooms ?? []) {
    drawRoom(ctx, room, {
      viewport: options.viewport,
      selected: options.selectedIds.has(room.id),
      roomFill: palette.roomFill,
      selection: palette.selection,
      selectionFill: palette.selectionFill,
      ...(options.roomFillColor !== undefined && { fillColor: options.roomFillColor }),
    })
  }
}

/** Paint each stair's footprint over the floor fills but beneath the wall strokes. */
function drawStairs(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  for (const stair of options.stairs ?? []) {
    drawStair(ctx, stair, { viewport: options.viewport, palette })
  }
}

/** Stroke each wall over the floor fills, stair footprints, and surface-paint bands. */
function drawWalls(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
}

/** Paint the surface-paint face bands and the active-surface highlight beneath the wall strokes. */
function drawSurfacePaintLayer(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  if (options.surfacePaint === undefined) return
  const { walls, viewport } = options
  drawSurfacePaint(ctx, { walls, viewport, ...options.surfacePaint })
}

/** Paint each dimension as an annotation overlay above the plan. */
function drawDimensions(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const preferences = options.roomLabels?.preferences ?? DEFAULT_METRIC_PREFERENCES
  const palette = paletteOf(options)
  const dimensions = options.dimensions ?? []
  const layouts = layoutDimensionLabels(
    dimensions.map((dimension) => dimension.node),
    options.viewport,
    { preferences },
  )
  const labelById = new Map(layouts.map((layout) => [layout.dimensionId, centerOf(layout.box)]))
  for (const dimension of dimensions) {
    const labelAnchor = labelById.get(dimension.node.id)
    const anchorOption = labelAnchor !== undefined ? { labelAnchor } : {}
    drawDimension(ctx, dimension, {
      viewport: options.viewport,
      palette,
      preferences,
      ...anchorOption,
    })
  }
}

/** Paint every room's label as an overlay above the fills and wall strokes so the text reads on top. */
function drawRoomLabels(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const roomLabels = options.roomLabels
  if (roomLabels === undefined) return
  const palette = paletteOf(options)
  const rooms = options.rooms ?? []
  // layoutRoomLabels returns one layout per room in input order, so each room is
  // drawn with the layout at the same index. The hidden ones paint nothing.
  const layouts = layoutRoomLabels(rooms, options.viewport, {
    preferences: roomLabels.preferences,
  })
  rooms.forEach((room, index) => {
    const layout = layouts[index]
    if (layout === undefined || layout.kind === 'hidden') return
    drawRoomLabel(ctx, room, {
      viewport: options.viewport,
      preferences: roomLabels.preferences,
      label: palette.label,
      anchor: centerOf(layout.box),
    })
  })
}

interface RoomDrawing {
  viewport: Viewport
  selected: boolean
  /** The default unselected room fill, from the palette. */
  roomFill: string
  /** The selection color for the selected-room outline. */
  selection: string
  /** The fill wash for a selected room, from the palette. */
  selectionFill: string
  /** The floor paint tint for an unselected room, or undefined for the default fill. */
  fillColor?: string
}

function drawRoom(ctx: PlanDrawingContext, room: RoomSceneNode, drawing: RoomDrawing): void {
  const [firstPoint, ...remainingPoints] = room.polygon
  if (firstPoint === undefined || remainingPoints.length < 2) return
  ctx.fillStyle = drawing.selected ? drawing.selectionFill : (drawing.fillColor ?? drawing.roomFill)
  ctx.beginPath()
  traceRingPath(ctx, room.polygon, drawing.viewport)
  // Holes wind opposite the outer ring so the nonzero rule leaves them unpainted.
  for (const hole of room.holes ?? []) {
    traceRingPath(ctx, [...hole].reverse(), drawing.viewport)
  }
  ctx.fill()
  if (drawing.selected) {
    ctx.strokeStyle = drawing.selection
    ctx.lineWidth = SELECTED_ROOM_LINE_WIDTH
    ctx.stroke()
  }
}

/** Trace one closed ring as a sub-path within the current path. */
function traceRingPath(ctx: PlanDrawingContext, ring: Point[], viewport: Viewport): void {
  ring.forEach((point, index) => {
    const screen = worldToScreen(point, viewport)
    if (index === 0) ctx.moveTo(screen.x, screen.y)
    else ctx.lineTo(screen.x, screen.y)
  })
  ctx.closePath()
}

function drawWall(ctx: PlanDrawingContext, wall: WallSceneNode, options: DrawPlanOptions): void {
  const palette = paletteOf(options)
  const from = worldToScreen(wall.start, options.viewport)
  const to = worldToScreen(wall.end, options.viewport)
  ctx.lineCap = LINE_CAP
  ctx.lineWidth = Math.max(MIN_WALL_PIXELS, wall.thickness * options.viewport.scale)
  ctx.strokeStyle = options.selectedIds.has(wall.id) ? palette.selection : palette.wall
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function drawPreview(
  ctx: PlanDrawingContext,
  preview: PreviewSegment,
  options: DrawPlanOptions,
): void {
  const color = paletteOf(options).preview
  const start = worldToScreen(preview.start, options.viewport)
  const end = worldToScreen(preview.end, options.viewport)
  drawPreviewLine(ctx, { start, end }, color)
  drawStartMarker(ctx, start, color)
}

function drawPreviewLine(
  ctx: PlanDrawingContext,
  segment: { start: Point; end: Point },
  color: string,
): void {
  ctx.lineCap = LINE_CAP
  ctx.lineWidth = PREVIEW_LINE_WIDTH
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(segment.start.x, segment.start.y)
  ctx.lineTo(segment.end.x, segment.end.y)
  ctx.stroke()
}

function drawStartMarker(ctx: PlanDrawingContext, center: Point, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(center.x, center.y, START_MARKER_RADIUS, 0, FULL_CIRCLE)
  ctx.fill()
}

/** Paint a handle marker at the wall's start and end screen positions so they track pan and zoom. */
export function drawEndpointHandles(
  ctx: PlanDrawingContext,
  wall: WallSceneNode,
  options: DrawPlanOptions,
): void {
  const color = paletteOf(options).selection
  drawEndpointHandle(ctx, worldToScreen(wall.start, options.viewport), color)
  drawEndpointHandle(ctx, worldToScreen(wall.end, options.viewport), color)
}

/** Paint a handle marker at the opening's two jamb screen positions so they track pan and zoom. */
export function drawOpeningResizeHandles(
  ctx: PlanDrawingContext,
  opening: OpeningSceneNode,
  viewport: Viewport,
): void {
  const { start, end } = openingJambs(opening)
  drawEndpointHandle(ctx, worldToScreen(start, viewport))
  drawEndpointHandle(ctx, worldToScreen(end, viewport))
}

function drawEndpointHandle(
  ctx: PlanDrawingContext,
  center: Point,
  color: string = DEFAULT_PLAN_PALETTE.selection,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(center.x, center.y, ENDPOINT_HANDLE_RADIUS_PX, 0, FULL_CIRCLE)
  ctx.fill()
}

/** Paint a room's name and area at its centroid, or at a resolved screen anchor when given; the area drops below a present name. */
export function drawRoomLabel(
  ctx: PlanDrawingContext,
  room: RoomSceneNode,
  options: {
    viewport: Viewport
    preferences: UnitPreferences
    label: string
    /** The de-conflicted screen anchor for the name line; defaults to the projected centroid. */
    anchor?: Point
  },
): void {
  const content = roomLabelContent(room, { preferences: options.preferences })
  const anchor = options.anchor ?? worldToScreen(content.anchor, options.viewport)
  ctx.font = LABEL_FONT
  ctx.fillStyle = options.label
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
