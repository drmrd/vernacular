import { rotatePoint, type Point, type StairSceneNode } from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import type { PlanPalette } from './plan-palette'
import { worldToScreen, type Viewport } from './viewport'

const STAIR_INK_WIDTH = 1
// The number of evenly spaced tread lines drawn across a straight run.
const TREAD_COUNT = 8
// The direction arrowhead spans this fraction of the run width to each side of the centerline.
const ARROW_HEAD_HALF_WIDTH_FRACTION = 0.2
// The arrowhead barbs reach back this fraction of the run length from the arrow tip.
const ARROW_HEAD_LENGTH_FRACTION = 0.12

/** Drawing context, viewport, and the resolved ink bundled for the helper routines; keeps helper signatures within the three-parameter limit. */
interface StairPainter {
  ctx: PlanDrawingContext
  viewport: Viewport
  /** The drawing ink for the footprint, treads, and direction arrow, from the palette wall color. */
  ink: string
}

/** Offset `stair.position` by `acrossMm` along +x and `alongMm` along +y, then rotate the result about the stair position by `stair.rotation`. */
function footprintPoint(stair: StairSceneNode, acrossMm: number, alongMm: number): Point {
  const local = { x: stair.position.x + acrossMm, y: stair.position.y + alongMm }
  return rotatePoint(local, stair.position, stair.rotation)
}

/**
 * The four footprint corners in world space, matching `stairWellPolygon`'s
 * min-corner convention: across runs 0 (left edge at the stair position) to
 * `width`, length runs 0 to `length`, each corner rotated about the stair
 * position.
 */
function footprintCorners(stair: StairSceneNode): readonly [Point, Point, Point, Point] {
  return [
    footprintPoint(stair, 0, 0),
    footprintPoint(stair, stair.width, 0),
    footprintPoint(stair, stair.width, stair.length),
    footprintPoint(stair, 0, stair.length),
  ]
}

function strokeSegment(painter: StairPainter, from: Point, to: Point): void {
  const a = worldToScreen(from, painter.viewport)
  const b = worldToScreen(to, painter.viewport)
  painter.ctx.beginPath()
  painter.ctx.moveTo(a.x, a.y)
  painter.ctx.lineTo(b.x, b.y)
  painter.ctx.stroke()
}

function setInk(painter: StairPainter): void {
  painter.ctx.strokeStyle = painter.ink
  painter.ctx.lineWidth = STAIR_INK_WIDTH
}

/** Stroke the closed footprint outline through the four world-space corners, projecting each to screen. */
function drawFootprint(
  painter: StairPainter,
  corners: readonly [Point, Point, Point, Point],
): void {
  const [first, ...rest] = corners
  const start = worldToScreen(first, painter.viewport)
  setInk(painter)
  painter.ctx.beginPath()
  painter.ctx.moveTo(start.x, start.y)
  for (const corner of rest) {
    const point = worldToScreen(corner, painter.viewport)
    painter.ctx.lineTo(point.x, point.y)
  }
  painter.ctx.closePath()
  painter.ctx.stroke()
}

/** Draw evenly spaced tread lines across the run, spanning across 0 to `width`, perpendicular to the +y run direction. */
function drawTreads(painter: StairPainter, stair: StairSceneNode): void {
  for (let tread = 1; tread < TREAD_COUNT; tread += 1) {
    const alongMm = (stair.length * tread) / TREAD_COUNT
    const left = footprintPoint(stair, 0, alongMm)
    const right = footprintPoint(stair, stair.width, alongMm)
    strokeSegment(painter, left, right)
  }
}

/** Draw a single direction arrow up the run centerline (across at half the width), from the base toward the top of the run. */
function drawDirectionArrow(painter: StairPainter, stair: StairSceneNode): void {
  const center = stair.width / 2
  const base = footprintPoint(stair, center, 0)
  const tip = footprintPoint(stair, center, stair.length)
  strokeSegment(painter, base, tip)
  const barbAlong = stair.length * (1 - ARROW_HEAD_LENGTH_FRACTION)
  const barbAcross = stair.width * ARROW_HEAD_HALF_WIDTH_FRACTION
  strokeSegment(painter, tip, footprintPoint(stair, center - barbAcross, barbAlong))
  strokeSegment(painter, tip, footprintPoint(stair, center + barbAcross, barbAlong))
}

/**
 * Paint one stair in screen space: the closed footprint outline, then the run.
 * A straight run gets evenly spaced tread lines; non-straight run types draw
 * only the centerline arrow because the turning and curved tread layouts are a
 * deferred 2D refinement.
 */
export function drawStair(
  ctx: PlanDrawingContext,
  stair: StairSceneNode,
  render: { viewport: Viewport; palette: PlanPalette },
): void {
  const painter: StairPainter = { ctx, viewport: render.viewport, ink: render.palette.wall }
  drawFootprint(painter, footprintCorners(stair))
  if (stair.runType === 'straight') {
    drawTreads(painter, stair)
  }
  drawDirectionArrow(painter, stair)
}
