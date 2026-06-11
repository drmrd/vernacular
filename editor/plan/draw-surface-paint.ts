import {
  WALL_NODE_PREFIX,
  type Point,
  type SurfaceRef,
  type SurfaceTreatment,
  type WallSceneNode,
} from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { worldToScreen, type Viewport } from './viewport'

// The width in pixels of a painted face band; thin so it reads as a face stripe, not a fill.
const BAND_LINE_WIDTH = 3
// The brass accent stroke for the active surface highlight. Distinct from any treatment color.
const ACTIVE_HIGHLIGHT_COLOR = '#b5894a'
const ACTIVE_HIGHLIGHT_WIDTH = 2
const HALF = 0.5
const FACE_SIDES = ['left', 'right'] as const

/** The walls to paint plus the lookups that resolve each face treatment and the active surface. */
export interface SurfacePaintLayer {
  walls: readonly WallSceneNode[]
  /** RAW wall id (no `wall:` prefix) + side -> treatment, or undefined when unpainted. */
  treatmentForFace: (wallId: string, side: 'left' | 'right') => SurfaceTreatment | undefined
  activeSurface: SurfaceRef | null
  viewport: Viewport
}

/** The drawing context and viewport bundled so helpers stay within the parameter limit. */
interface SurfacePainter {
  ctx: PlanDrawingContext
  viewport: Viewport
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** The unit direction from `start` to `end`, or the zero vector for a degenerate wall. */
function unitDirection(start: Point, end: Point): Point {
  const delta = subtract(end, start)
  const length = Math.hypot(delta.x, delta.y)
  if (length === 0) {
    return { x: 0, y: 0 }
  }
  return { x: delta.x / length, y: delta.y / length }
}

/** The raw wall id with the `wall:` scene-node prefix that `deriveWallNode` always prepends removed. */
function rawWallId(wall: WallSceneNode): string {
  return wall.id.slice(WALL_NODE_PREFIX.length)
}

/** Stroke a single screen-space segment from `from` to `to`, like `drawWall` in draw-plan.ts. */
function strokeSegment(painter: SurfacePainter, from: Point, to: Point): void {
  const a = worldToScreen(from, painter.viewport)
  const b = worldToScreen(to, painter.viewport)
  painter.ctx.beginPath()
  painter.ctx.moveTo(a.x, a.y)
  painter.ctx.lineTo(b.x, b.y)
  painter.ctx.stroke()
}

/** One painted wall face: the wall, the side it faces, and the treatment resolved for it. */
interface PaintedFace {
  wall: WallSceneNode
  side: 'left' | 'right'
  treatment: SurfaceTreatment
}

/** Offset both wall endpoints perpendicular toward the face, then stroke the band in the treatment color. */
function strokeBand(painter: SurfacePainter, face: PaintedFace): void {
  const { wall, side, treatment } = face
  const direction = unitDirection(wall.start, wall.end)
  const perpendicular = { x: -direction.y, y: direction.x }
  const reach = (side === 'left' ? 1 : -1) * wall.thickness * HALF
  const offset = { x: perpendicular.x * reach, y: perpendicular.y * reach }
  painter.ctx.strokeStyle = treatment.color.srgbHex
  painter.ctx.lineWidth = BAND_LINE_WIDTH
  const from = { x: wall.start.x + offset.x, y: wall.start.y + offset.y }
  const to = { x: wall.end.x + offset.x, y: wall.end.y + offset.y }
  strokeSegment(painter, from, to)
}

/** Paint a band for each painted face of one wall, skipping faces without a treatment. */
function drawWallBands(
  painter: SurfacePainter,
  wall: WallSceneNode,
  layer: SurfacePaintLayer,
): void {
  for (const side of FACE_SIDES) {
    const treatment = layer.treatmentForFace(rawWallId(wall), side)
    if (treatment !== undefined) {
      strokeBand(painter, { wall, side, treatment })
    }
  }
}

/** The wall whose raw id matches the active wall-face surface, or undefined when none is active. */
function activeWall(layer: SurfacePaintLayer): WallSceneNode | undefined {
  const active = layer.activeSurface
  if (active === null || active.kind !== 'wall-face') {
    return undefined
  }
  return layer.walls.find((wall) => rawWallId(wall) === active.wallId)
}

/** Stroke the brass accent centerline over the active wall so the user sees the painted target. */
function drawActiveHighlight(painter: SurfacePainter, layer: SurfacePaintLayer): void {
  const wall = activeWall(layer)
  if (wall === undefined) {
    return
  }
  painter.ctx.strokeStyle = ACTIVE_HIGHLIGHT_COLOR
  painter.ctx.lineWidth = ACTIVE_HIGHLIGHT_WIDTH
  strokeSegment(painter, wall.start, wall.end)
}

/** Paint each painted wall face as a thin colored band, then highlight the active surface's wall. */
export function drawSurfacePaint(ctx: PlanDrawingContext, layer: SurfacePaintLayer): void {
  const painter: SurfacePainter = { ctx, viewport: layer.viewport }
  for (const wall of layer.walls) {
    drawWallBands(painter, wall, layer)
  }
  drawActiveHighlight(painter, layer)
}
