import { type OpeningSceneNode, type Point } from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { openingCorners, swingLeafGeometry } from './opening-geometry'
import type { PlanPalette } from './plan-palette'
import { worldToScreen, type Viewport } from './viewport'

/** A scene-graph opening node paired with the render decisions resolved from its element type and the selection. */
export interface DrawableOpening {
  node: OpeningSceneNode
  /** The element type's plan2D.symbol family routine id. */
  symbol: string
  double: boolean
  selected: boolean
}

// The provisional gap fill that breaks the wall stroke; the slice documents this as a background-color gap.
const OPENING_GAP_COLOR = '#ffffff'
const OPENING_INK_WIDTH = 1
const OPENING_SELECTION_WIDTH = 2
// The pivot dot radius in screen pixels.
const PIVOT_DOT_RADIUS_PX = 3
const FULL_CIRCLE = Math.PI * 2
// A sliding panel sits a fraction of the wall thickness off the centerline.
const PANEL_OFFSET_FRACTION = 0.25
// The crank tick reaches a fraction of the opening width off the facing face.
const CRANK_TICK_FRACTION = 0.3
const HALF = 0.5

/** The seam plus the viewport and resolved palette colors, the collaborators every routine threads through, bundled so helpers stay within the parameter limit. */
interface OpeningPainter {
  ctx: PlanDrawingContext
  viewport: Viewport
  /** The drawing ink for jamb caps and family symbols, from the palette wall color. */
  ink: string
  /** The highlight stroke for a selected opening, from the palette selection color. */
  selection: string
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

function scale(v: Point, factor: number): Point {
  return { x: v.x * factor, y: v.y * factor }
}

function facingSign(node: OpeningSceneNode): number {
  return node.orientation.facing === 'positive' ? 1 : -1
}

function hingeSign(node: OpeningSceneNode): number {
  return node.orientation.hinge === 'start' ? -1 : 1
}

function hingeJamb(node: OpeningSceneNode): Point {
  return add(node.center, scale(node.along, hingeSign(node) * node.width * HALF))
}

function otherJamb(node: OpeningSceneNode): Point {
  return add(node.center, scale(node.along, -hingeSign(node) * node.width * HALF))
}

function strokeSegment(painter: OpeningPainter, from: Point, to: Point): void {
  const a = worldToScreen(from, painter.viewport)
  const b = worldToScreen(to, painter.viewport)
  painter.ctx.beginPath()
  painter.ctx.moveTo(a.x, a.y)
  painter.ctx.lineTo(b.x, b.y)
  painter.ctx.stroke()
}

/**
 * Stroke a swing arc centered at the hinge, sweeping from the open leaf end
 * toward the closed-door position. All three world points are projected to
 * screen first, so the y-axis flip and any wall orientation are handled by the
 * `atan2` angles rather than assuming screen axes.
 */
function strokeArc(
  painter: OpeningPainter,
  swing: { hinge: Point; leafEnd: Point; closed: Point; counterclockwise?: boolean | undefined },
): void {
  const center = worldToScreen(swing.hinge, painter.viewport)
  const open = worldToScreen(swing.leafEnd, painter.viewport)
  const closed = worldToScreen(swing.closed, painter.viewport)
  const radius = Math.hypot(open.x - center.x, open.y - center.y)
  const startAngle = Math.atan2(open.y - center.y, open.x - center.x)
  const endAngle = Math.atan2(closed.y - center.y, closed.x - center.x)
  painter.ctx.beginPath()
  painter.ctx.arc(center.x, center.y, radius, startAngle, endAngle, swing.counterclockwise)
  painter.ctx.stroke()
}

/** Stroke a connected open path through the world-space points, projecting each to screen. No `closePath`, so the last point is not joined back to the first. */
function strokePolyline(painter: OpeningPainter, ...points: Point[]): void {
  const screen = points.map((point) => worldToScreen(point, painter.viewport))
  const first = screen[0]
  if (first === undefined) {
    return
  }
  painter.ctx.beginPath()
  painter.ctx.moveTo(first.x, first.y)
  for (const point of screen.slice(1)) {
    painter.ctx.lineTo(point.x, point.y)
  }
  painter.ctx.stroke()
}

function tracePolygon(painter: OpeningPainter, corners: readonly Point[]): void {
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

/** Fill the opening footprint in the gap color so the wall stroke is broken, then stroke a jamb cap across the wall at each jamb. */
function drawGapAndJambs(painter: OpeningPainter, node: OpeningSceneNode): void {
  painter.ctx.fillStyle = OPENING_GAP_COLOR
  tracePolygon(painter, openingCorners(node))
  painter.ctx.fill()

  painter.ctx.strokeStyle = painter.ink
  painter.ctx.lineWidth = OPENING_INK_WIDTH
  const across = scale(node.normal, node.hostThickness * HALF)
  for (const jamb of [hingeJamb(node), otherJamb(node)]) {
    strokeSegment(painter, add(jamb, scale(across, -1)), add(jamb, across))
  }
}

function setInk(painter: OpeningPainter): void {
  painter.ctx.strokeStyle = painter.ink
  painter.ctx.lineWidth = OPENING_INK_WIDTH
}

function drawDoorSwing(painter: OpeningPainter, opening: DrawableOpening): void {
  setInk(painter)
  const node = opening.node
  // The primary leaf consumes the pure helper's hinge, open tip, closed jamb, and
  // sweep direction directly, so the geometry has a single authoritative source.
  const primary = swingLeafGeometry(node, { leaf: 'primary' })
  strokeSegment(painter, primary.hinge, primary.leafEnd)
  strokeArc(painter, primary)
  if (opening.double) {
    // The secondary leaf mirrors the primary across the opening centerline onto the
    // same facing side, pivoting from the other jamb with the opposite sweep flag.
    const secondary = swingLeafGeometry(node, { leaf: 'secondary' })
    strokeSegment(painter, secondary.hinge, secondary.leafEnd)
    strokeArc(painter, secondary)
  }
}

function drawDoorSlide(painter: OpeningPainter, opening: DrawableOpening): void {
  const node = opening.node
  setInk(painter)
  const offset = scale(node.normal, facingSign(node) * node.hostThickness * PANEL_OFFSET_FRACTION)
  const start = hingeJamb(node)
  const end = otherJamb(node)
  // A thin panel parallel to the wall, offset to one side.
  tracePolygon(painter, [add(start, offset), add(end, offset), end, start])
  painter.ctx.stroke()
  // A short track line spanning the opening along the wall.
  strokeSegment(painter, start, end)
}

function drawDoorFold(painter: OpeningPainter, opening: DrawableOpening): void {
  const node = opening.node
  setInk(painter)
  const hinge = hingeJamb(node)
  // A two-segment zigzag: out to the fold knuckle on the facing side, then back to the other jamb.
  const knuckle = add(node.center, scale(node.normal, facingSign(node) * node.width * HALF))
  strokePolyline(painter, hinge, knuckle, otherJamb(node))
}

function drawDoorPivot(painter: OpeningPainter, opening: DrawableOpening): void {
  const node = opening.node
  setInk(painter)
  const leaf = swingLeafGeometry(node, { leaf: 'primary' })
  strokeSegment(painter, leaf.hinge, leaf.leafEnd)
  // A filled pivot dot at the hinge.
  const dot = worldToScreen(leaf.hinge, painter.viewport)
  painter.ctx.fillStyle = painter.ink
  painter.ctx.beginPath()
  painter.ctx.arc(dot.x, dot.y, PIVOT_DOT_RADIUS_PX, 0, FULL_CIRCLE)
  painter.ctx.fill()
  // The swing arc.
  strokeArc(painter, leaf)
}

function drawCasedOpening(): void {
  // Cased openings draw nothing beyond the gap and jamb caps. The unused
  // `FamilyRoutine` parameters are omitted because the signature is structurally
  // assignable to it without them.
}

function drawWindowFrame(painter: OpeningPainter, node: OpeningSceneNode): void {
  setInk(painter)
  const start = hingeJamb(node)
  const end = otherJamb(node)
  const half = scale(node.normal, node.hostThickness * HALF)
  // The two frame lines along the wall faces.
  strokeSegment(painter, add(start, scale(half, -1)), add(end, scale(half, -1)))
  strokeSegment(painter, add(start, half), add(end, half))
  // The glazing line spanning jamb to jamb across the gap.
  strokeSegment(painter, start, end)
}

function drawWindowFixed(painter: OpeningPainter, opening: DrawableOpening): void {
  drawWindowFrame(painter, opening.node)
}

function drawWindowCrank(painter: OpeningPainter, opening: DrawableOpening): void {
  const node = opening.node
  drawWindowFrame(painter, node)
  // An opening-direction tick on the facing side.
  const tickEnd = add(
    node.center,
    scale(node.normal, facingSign(node) * node.width * CRANK_TICK_FRACTION),
  )
  strokeSegment(painter, node.center, tickEnd)
}

type FamilyRoutine = (painter: OpeningPainter, opening: DrawableOpening) => void

function familyRoutine(symbol: string): FamilyRoutine | undefined {
  switch (symbol) {
    case 'door-swing':
      return drawDoorSwing
    case 'door-slide':
      return drawDoorSlide
    case 'door-fold':
      return drawDoorFold
    case 'door-pivot':
      return drawDoorPivot
    case 'cased-opening':
      return drawCasedOpening
    case 'window-fixed':
      return drawWindowFixed
    case 'window-crank':
      return drawWindowCrank
    default:
      return undefined
  }
}

function drawSelectionHighlight(painter: OpeningPainter, node: OpeningSceneNode): void {
  painter.ctx.strokeStyle = painter.selection
  painter.ctx.lineWidth = OPENING_SELECTION_WIDTH
  tracePolygon(painter, openingCorners(node))
  painter.ctx.stroke()
}

/** Paint one opening in screen space: break the host wall with a gap and jamb caps, draw the family symbol, then a selection highlight when selected. */
export function drawOpening(
  ctx: PlanDrawingContext,
  opening: DrawableOpening,
  render: { viewport: Viewport; palette: PlanPalette },
): void {
  const painter: OpeningPainter = {
    ctx,
    viewport: render.viewport,
    ink: render.palette.wall,
    selection: render.palette.selection,
  }
  drawGapAndJambs(painter, opening.node)
  const routine = familyRoutine(opening.symbol)
  if (routine !== undefined) {
    routine(painter, opening)
  }
  if (opening.selected) {
    drawSelectionHighlight(painter, opening.node)
  }
}
