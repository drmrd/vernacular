import {
  WALL_NODE_PREFIX,
  effectiveWallThickness,
  wallFaceGeometry,
  type OpeningSceneNode,
  type Point,
  type SurfaceRef,
  type SurfaceTreatment,
  type WallFaceStretch,
  type WallSceneNode,
} from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { openingSpansAlong } from './opening-spans'
import { PLAN_INK_EMPHASIS, PLAN_INK_OVERLAY_WIDTH } from './plan-ink'
import { worldToScreen, type Viewport } from './viewport'

// The brass accent stroke for the active surface highlight. Distinct from any treatment color.
const ACTIVE_HIGHLIGHT_COLOR = '#b5894a'
// The three surface-paint strokes stack, each one emphasis step heavier than the
// stroke it has to read over: the accent centerline sits over the plan ink, the
// painted face band over the centerline, and the highlighted-face band over the
// painted band. Rooting the ladder at the overlay weight keeps that order intact
// when the ink hierarchy is retuned, and keeps a band thin enough to read as a face
// stripe rather than a fill.
const ACTIVE_HIGHLIGHT_WIDTH = PLAN_INK_OVERLAY_WIDTH
const BAND_LINE_WIDTH = ACTIVE_HIGHLIGHT_WIDTH + PLAN_INK_EMPHASIS
const HIGHLIGHT_BAND_WIDTH = BAND_LINE_WIDTH + PLAN_INK_EMPHASIS
const HALF = 0.5
const FACE_SIDES = ['left', 'right'] as const

interface SurfacePaintWall extends WallSceneNode {
  covers?: readonly string[]
}

/** The wall runs to paint plus the lookups that resolve each face treatment and the active surface. */
export interface SurfacePaintLayer {
  walls: readonly SurfacePaintWall[]
  /** RAW wall id (no `wall:` prefix) + side -> treatment, or undefined when unpainted. */
  treatmentForFace: (wallId: string, side: 'left' | 'right') => SurfaceTreatment | undefined
  activeSurface: SurfaceRef | null
  /**
   * The wall face to highlight on top, drawn even when that face is unpainted.
   *
   * Optional (unlike the required `activeSurface`) because not every caller supplies a
   * hover/selection highlight target yet. This reflects incremental delivery of the inspector
   * finish-chip link, not a deliberate API asymmetry; callers without a highlight omit the field.
   */
  highlightedSurface?: SurfaceRef | null
  /**
   * The openings cut into the walls being painted. A band stops at each jamb of
   * an opening hosted on its wall, because a doorway leaves no face there to
   * finish. Optional so a caller with no openings can leave it off.
   */
  openings?: readonly OpeningSceneNode[]
  viewport: Viewport
}

/** The drawing context, viewport, and wall openings bundled so helpers stay within the parameter limit. */
interface SurfacePainter {
  ctx: PlanDrawingContext
  viewport: Viewport
  /** The openings every band routine cuts its wall's face bands at. */
  openings: readonly OpeningSceneNode[]
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

/** Stroke a single screen-space segment from `from` to `to`, like `strokeFaceLine` in draw-plan.ts. */
function strokeSegment(painter: SurfacePainter, from: Point, to: Point): void {
  const a = worldToScreen(from, painter.viewport)
  const b = worldToScreen(to, painter.viewport)
  painter.ctx.beginPath()
  painter.ctx.moveTo(a.x, a.y)
  painter.ctx.lineTo(b.x, b.y)
  painter.ctx.stroke()
}

/** The wall's endpoints offset perpendicular toward `side` by half the resolved assembly thickness. */
function offsetBand(wall: WallSceneNode, side: 'left' | 'right'): { from: Point; to: Point } {
  const direction = unitDirection(wall.start, wall.end)
  const perpendicular = { x: -direction.y, y: direction.x }
  const reach = (side === 'left' ? 1 : -1) * effectiveWallThickness(wall) * HALF
  const offset = { x: perpendicular.x * reach, y: perpendicular.y * reach }
  return {
    from: { x: wall.start.x + offset.x, y: wall.start.y + offset.y },
    to: { x: wall.end.x + offset.x, y: wall.end.y + offset.y },
  }
}

/**
 * The stretches of `wall`'s two face bands that its openings leave standing.
 *
 * A face band is a line parallel to the centerline at a half-thickness offset,
 * which is what `wallFaceGeometry` cuts, so the band composes that helper instead
 * of repeating the span algebra. The corners handed in are the square offsets from
 * the wall's own endpoints, the unmitred form of the mitred corners the drawn face
 * lines use, so a band still falls short of or runs past a mitred corner at a
 * non-collinear junction (issue #547). What it gains is the same square cut at
 * each jamb the poche and the face lines already take.
 */
function bandStretches(
  wall: SurfacePaintWall,
  openings: readonly OpeningSceneNode[],
): WallFaceStretch[] {
  const left = offsetBand(wall, 'left')
  const right = offsetBand(wall, 'right')
  const centerline = {
    start: wall.start,
    end: wall.end,
    wallId: rawWallId(wall),
    covers: wall.covers ?? [],
  }
  return wallFaceGeometry({
    start: wall.start,
    end: wall.end,
    corners: { aPlus: left.from, bPlus: left.to, aMinus: right.from, bMinus: right.to },
    gaps: openingSpansAlong(centerline, openings),
  })
}

/** Stroke the standing stretches of one side's face band. */
function strokeFaceBands(
  painter: SurfacePainter,
  stretches: readonly WallFaceStretch[],
  side: 'left' | 'right',
): void {
  for (const stretch of stretches) {
    const face = side === 'left' ? stretch.plusFace : stretch.minusFace
    strokeSegment(painter, face[0], face[1])
  }
}

/** Paint a band for each painted face of one wall, skipping faces without a treatment. */
function drawWallBands(
  painter: SurfacePainter,
  wall: SurfacePaintWall,
  layer: SurfacePaintLayer,
): void {
  let stretches: WallFaceStretch[] | undefined
  for (const side of FACE_SIDES) {
    const treatment = layer.treatmentForFace(rawWallId(wall), side)
    if (treatment?.kind !== 'solid') continue
    stretches ??= bandStretches(wall, painter.openings)
    painter.ctx.strokeStyle = treatment.color.srgbHex
    painter.ctx.lineWidth = BAND_LINE_WIDTH
    strokeFaceBands(painter, stretches, side)
  }
}

/**
 * Stroke the brass accent centerline over the runs owned by the active wall,
 * including its openings.
 */
function drawActiveHighlight(painter: SurfacePainter, layer: SurfacePaintLayer): void {
  const active = layer.activeSurface
  if (active?.kind !== 'wall-face') return
  for (const wall of layer.walls) {
    if (rawWallId(wall) !== active.wallId) continue
    painter.ctx.strokeStyle = ACTIVE_HIGHLIGHT_COLOR
    painter.ctx.lineWidth = ACTIVE_HIGHLIGHT_WIDTH
    strokeSegment(painter, wall.start, wall.end)
  }
}

/** Stroke the brass accent band along the highlighted wall face, even when that face is unpainted. */
function drawHighlightedFace(painter: SurfacePainter, layer: SurfacePaintLayer): void {
  const highlighted = layer.highlightedSurface
  if (highlighted?.kind !== 'wall-face') return
  for (const wall of layer.walls) {
    if (rawWallId(wall) !== highlighted.wallId) continue
    painter.ctx.strokeStyle = ACTIVE_HIGHLIGHT_COLOR
    painter.ctx.lineWidth = HIGHLIGHT_BAND_WIDTH
    strokeFaceBands(painter, bandStretches(wall, painter.openings), highlighted.side)
  }
}

/** Paint each painted wall face as a thin colored band, then highlight the active surface's wall. */
export function drawSurfacePaint(ctx: PlanDrawingContext, layer: SurfacePaintLayer): void {
  const painter: SurfacePainter = {
    ctx,
    viewport: layer.viewport,
    openings: layer.openings ?? [],
  }
  for (const wall of layer.walls) {
    drawWallBands(painter, wall, layer)
  }
  drawActiveHighlight(painter, layer)
  drawHighlightedFace(painter, layer)
}
