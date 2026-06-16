import { rotatePoint, type FurnitureInstance, type Point } from '../../core'
import { DEGREES_PER_HALF_TURN } from './angles'
import type { PlanDrawingContext } from './draw-plan'
import type { PlanPalette } from './plan-palette'
import { worldToScreen, type Viewport } from './viewport'

// Footprint half-extents split the full width and depth about the center.
const HALF_DIVISOR = 2
// Degrees to radians for the free-angle instance rotation.
const RADIANS_PER_DEGREE = Math.PI / DEGREES_PER_HALF_TURN
const FURNITURE_INK_WIDTH = 1
const FURNITURE_SELECTION_WIDTH = 2
const FURNITURE_LABEL_FONT = '12px sans-serif'
// Shown when an instance carries no name of its own.
const DEFAULT_FURNITURE_LABEL = 'Furniture'

/** The world-space footprint of a furniture instance, ready to project and label. */
export interface FurnitureSymbol {
  /** Four world-space corners of the footprint rectangle, after rotation. */
  corners: Point[]
  /** The instance name, or a default when unnamed. */
  label: string
}

function instanceLabel(instance: FurnitureInstance): string {
  const name = instance.name
  if (name !== undefined && name !== '') {
    return name
  }
  return DEFAULT_FURNITURE_LABEL
}

/** Resolve the rotated footprint rectangle and label of a furniture instance. */
export function furnitureSymbol(instance: FurnitureInstance): FurnitureSymbol {
  const { position, footprint, rotation } = instance
  const halfWidth = footprint.width / HALF_DIVISOR
  const halfDepth = footprint.depth / HALF_DIVISOR
  // Local corners in winding order: top-left, top-right, bottom-right, bottom-left.
  const local: Point[] = [
    { x: position.x - halfWidth, y: position.y - halfDepth },
    { x: position.x + halfWidth, y: position.y - halfDepth },
    { x: position.x + halfWidth, y: position.y + halfDepth },
    { x: position.x - halfWidth, y: position.y + halfDepth },
  ]
  const radians = rotation * RADIANS_PER_DEGREE
  return {
    corners: local.map((corner) => rotatePoint(corner, position, radians)),
    label: instanceLabel(instance),
  }
}

/** A furniture instance paired with whether it is selected. */
export interface DrawableFurniture {
  instance: FurnitureInstance
  selected: boolean
}

/** The seam plus viewport bundled so the trace helper stays within the parameter limit. */
interface FurniturePainter {
  ctx: PlanDrawingContext
  viewport: Viewport
}

function tracePolygon(painter: FurniturePainter, corners: readonly Point[]): void {
  const screen = corners.map((corner) => worldToScreen(corner, painter.viewport))
  const first = screen[0]
  // The guard handles an empty corner list: with no first vertex there is nothing to trace.
  if (first === undefined) {
    return
  }
  painter.ctx.beginPath()
  painter.ctx.moveTo(first.x, first.y)
  for (const point of screen.slice(1)) {
    painter.ctx.lineTo(point.x, point.y)
  }
  painter.ctx.closePath()
}

/** Paint one furniture instance in screen space: its footprint outline, a name label, then a selection highlight when selected. */
export function drawFurniture(
  ctx: PlanDrawingContext,
  furniture: DrawableFurniture,
  render: { viewport: Viewport; palette: PlanPalette },
): void {
  const painter: FurniturePainter = { ctx, viewport: render.viewport }
  const symbol = furnitureSymbol(furniture.instance)

  tracePolygon(painter, symbol.corners)
  ctx.strokeStyle = render.palette.wall
  ctx.lineWidth = FURNITURE_INK_WIDTH
  ctx.stroke()

  const labelPos = worldToScreen(furniture.instance.position, render.viewport)
  ctx.font = FURNITURE_LABEL_FONT
  ctx.fillStyle = render.palette.wall
  ctx.fillText(symbol.label, labelPos.x, labelPos.y)

  if (furniture.selected) {
    tracePolygon(painter, symbol.corners)
    ctx.strokeStyle = render.palette.selection
    ctx.lineWidth = FURNITURE_SELECTION_WIDTH
    ctx.stroke()
  }
}
