import { rotatePoint, type Point, type StairSceneNode } from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { worldToScreen, type Viewport } from './viewport'

// The dark stroke for the stair footprint, treads, and direction arrow, matching the wall ink.
const STAIR_INK_COLOR = '#222222'
const STAIR_INK_WIDTH = 1
// The number of evenly spaced tread lines drawn across a straight run.
const TREAD_COUNT = 8
const HALF = 0.5
// The direction arrowhead spans this fraction of the run width to each side of the centerline.
const ARROW_HEAD_HALF_WIDTH_FRACTION = 0.2
// The arrowhead barbs reach back this fraction of the run length from the arrow tip.
const ARROW_HEAD_LENGTH_FRACTION = 0.12

/** The seam plus the viewport, the two collaborators every routine threads through, bundled so helpers stay within the parameter limit. */
interface StairPainter {
  ctx: PlanDrawingContext
  viewport: Viewport
}

/** Offset `stair.position` by `acrossMm` along +x and `alongMm` along +y, then rotate the result about the stair position by `stair.rotation`. */
function footprintPoint(stair: StairSceneNode, acrossMm: number, alongMm: number): Point {
  const local = { x: stair.position.x + acrossMm, y: stair.position.y + alongMm }
  return rotatePoint(local, stair.position, stair.rotation)
}

/** The four footprint corners in world space: width runs across +x, length along +y, each rotated about the stair position. */
function footprintCorners(stair: StairSceneNode): Point[] {
  const halfWidth = stair.width * HALF
  return [
    footprintPoint(stair, -halfWidth, 0),
    footprintPoint(stair, halfWidth, 0),
    footprintPoint(stair, halfWidth, stair.length),
    footprintPoint(stair, -halfWidth, stair.length),
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
  painter.ctx.strokeStyle = STAIR_INK_COLOR
  painter.ctx.lineWidth = STAIR_INK_WIDTH
}

/** Stroke the closed footprint outline through the four world-space corners, projecting each to screen. */
function drawFootprint(painter: StairPainter, corners: readonly Point[]): void {
  const screen = corners.map((corner) => worldToScreen(corner, painter.viewport))
  const first = screen[0]
  if (first === undefined) {
    return
  }
  setInk(painter)
  painter.ctx.beginPath()
  painter.ctx.moveTo(first.x, first.y)
  for (const point of screen.slice(1)) {
    painter.ctx.lineTo(point.x, point.y)
  }
  painter.ctx.closePath()
  painter.ctx.stroke()
}

/** Draw evenly spaced tread lines across the run, perpendicular to the +y run direction. */
function drawTreads(painter: StairPainter, stair: StairSceneNode): void {
  const halfWidth = stair.width * HALF
  for (let tread = 1; tread < TREAD_COUNT; tread += 1) {
    const alongMm = (stair.length * tread) / TREAD_COUNT
    const left = footprintPoint(stair, -halfWidth, alongMm)
    const right = footprintPoint(stair, halfWidth, alongMm)
    strokeSegment(painter, left, right)
  }
}

/** Draw a single direction arrow up the run centerline, from the base toward the top of the run. */
function drawDirectionArrow(painter: StairPainter, stair: StairSceneNode): void {
  const base = footprintPoint(stair, 0, 0)
  const tip = footprintPoint(stair, 0, stair.length)
  strokeSegment(painter, base, tip)
  const barbAlong = stair.length * (1 - ARROW_HEAD_LENGTH_FRACTION)
  const barbAcross = stair.width * ARROW_HEAD_HALF_WIDTH_FRACTION
  strokeSegment(painter, tip, footprintPoint(stair, -barbAcross, barbAlong))
  strokeSegment(painter, tip, footprintPoint(stair, barbAcross, barbAlong))
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
  viewport: Viewport,
): void {
  const painter: StairPainter = { ctx, viewport }
  drawFootprint(painter, footprintCorners(stair))
  if (stair.runType === 'straight') {
    drawTreads(painter, stair)
  }
  drawDirectionArrow(painter, stair)
}
