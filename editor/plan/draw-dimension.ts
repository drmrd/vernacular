import {
  type DimensionSceneNode,
  type Point,
  type UnitPreferences,
  dimensionGeometry,
  formatLength,
  lengthFormatOptions,
} from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { worldToScreen, type Viewport, type ScreenPoint } from './viewport'

/** A dimension scene node paired with the render decisions resolved from the selection. */
export interface DrawableDimension {
  node: DimensionSceneNode
  selected: boolean
}

// The dark ink for the dimension line, arrowheads, and extension lines.
const DIMENSION_INK_COLOR = '#222222'
// The highlight stroke for a selected dimension, matching the wall/room/opening selection blue.
const DIMENSION_SELECTION_COLOR = '#1a7fd4'
const DIMENSION_INK_WIDTH = 1
const DIMENSION_SELECTION_WIDTH = 2
// Each arrowhead vee reaches this many screen pixels back from the line tip.
const ARROWHEAD_LENGTH_PX = 8
// The half-angle of the arrowhead vee, in radians.
const ARROWHEAD_VEE_DIVISIONS = 8
const ARROWHEAD_ANGLE = Math.PI / ARROWHEAD_VEE_DIVISIONS
// The measured-length text styling mirrors the room label.
const TEXT_COLOR = '#37414d'
const TEXT_FONT = '12px sans-serif'
const TEXT_ALIGN = 'center' as const
const TEXT_BASELINE = 'middle' as const
const HALF = 0.5

/** The seam plus the viewport, the two collaborators every routine threads through, bundled so helpers stay within the parameter limit. */
interface DimensionPainter {
  ctx: PlanDrawingContext
  viewport: Viewport
}

function strokeScreenSegment(painter: DimensionPainter, from: ScreenPoint, to: ScreenPoint): void {
  painter.ctx.beginPath()
  painter.ctx.moveTo(from.x, from.y)
  painter.ctx.lineTo(to.x, to.y)
  painter.ctx.stroke()
}

function strokeWorldSegment(painter: DimensionPainter, from: Point, to: Point): void {
  strokeScreenSegment(
    painter,
    worldToScreen(from, painter.viewport),
    worldToScreen(to, painter.viewport),
  )
}

/** A single arrowhead vee: two short segments from `tip` back along the line direction, each rotated by +/- the fixed angle. */
function strokeArrowhead(
  painter: DimensionPainter,
  tip: ScreenPoint,
  direction: ScreenPoint,
): void {
  for (const angle of [ARROWHEAD_ANGLE, -ARROWHEAD_ANGLE]) {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const rotatedX = direction.x * cos - direction.y * sin
    const rotatedY = direction.x * sin + direction.y * cos
    const barb: ScreenPoint = {
      x: tip.x + rotatedX * ARROWHEAD_LENGTH_PX,
      y: tip.y + rotatedY * ARROWHEAD_LENGTH_PX,
    }
    strokeScreenSegment(painter, tip, barb)
  }
}

/** The screen unit direction from `lineStart` toward `lineEnd`, or a zero vector for a degenerate line. */
function screenDirection(start: ScreenPoint, end: ScreenPoint): ScreenPoint {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length === 0) {
    return { x: 0, y: 0 }
  }
  return { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
}

/** The measured length placed at a screen midpoint, with the unit preferences that format it. */
interface DimensionLabel {
  node: DimensionSceneNode
  midpoint: ScreenPoint
  preferences: UnitPreferences
}

function fillLengthText(painter: DimensionPainter, label: DimensionLabel): void {
  painter.ctx.font = TEXT_FONT
  painter.ctx.fillStyle = TEXT_COLOR
  painter.ctx.textAlign = TEXT_ALIGN
  painter.ctx.textBaseline = TEXT_BASELINE
  painter.ctx.fillText(
    formatLength(label.node.length, lengthFormatOptions(label.preferences)),
    label.midpoint.x,
    label.midpoint.y,
  )
}

function setInk(painter: DimensionPainter): void {
  painter.ctx.strokeStyle = DIMENSION_INK_COLOR
  painter.ctx.lineWidth = DIMENSION_INK_WIDTH
}

/** Paint one dimension in screen space: the offset dimension line, an arrowhead at each end, the two extension lines, and the measured-length text at the line midpoint, plus a selection highlight when selected. */
// eslint-disable-next-line max-params -- the public seam mirrors drawOpening plus the unit preferences the length text needs.
export function drawDimension(
  ctx: PlanDrawingContext,
  dimension: DrawableDimension,
  viewport: Viewport,
  preferences: UnitPreferences,
): void {
  const painter: DimensionPainter = { ctx, viewport }
  const node = dimension.node
  const geometry = dimensionGeometry(node.start, node.end, node.offset)
  const lineStart = worldToScreen(geometry.lineStart, viewport)
  const lineEnd = worldToScreen(geometry.lineEnd, viewport)

  setInk(painter)
  strokeScreenSegment(painter, lineStart, lineEnd)
  strokeWorldSegment(painter, geometry.extensionStart[0], geometry.extensionStart[1])
  strokeWorldSegment(painter, geometry.extensionEnd[0], geometry.extensionEnd[1])

  const direction = screenDirection(lineStart, lineEnd)
  strokeArrowhead(painter, lineStart, direction)
  strokeArrowhead(painter, lineEnd, { x: -direction.x, y: -direction.y })

  const midpoint: ScreenPoint = {
    x: lineStart.x + (lineEnd.x - lineStart.x) * HALF,
    y: lineStart.y + (lineEnd.y - lineStart.y) * HALF,
  }
  fillLengthText(painter, { node, midpoint, preferences })

  if (dimension.selected) {
    painter.ctx.strokeStyle = DIMENSION_SELECTION_COLOR
    painter.ctx.lineWidth = DIMENSION_SELECTION_WIDTH
    strokeScreenSegment(painter, lineStart, lineEnd)
  }
}
