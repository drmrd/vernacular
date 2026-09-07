import {
  WALL_NODE_PREFIX,
  effectiveWallThickness,
  wallFaceGeometry,
  type OpeningSceneNode,
  type Point,
  type SurfaceRef,
  type SurfaceTreatment,
  type WallFaceGap,
  type WallFaceStretch,
  type WallSceneNode,
} from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { openingJambs, projectPointOntoWall } from './opening-geometry'
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

/** The walls to paint plus the lookups that resolve each face treatment and the active surface. */
export interface SurfacePaintLayer {
  walls: readonly WallSceneNode[]
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

/** One painted wall face: the wall, the side it faces, and the treatment resolved for it. */
interface PaintedFace {
  wall: WallSceneNode
  side: 'left' | 'right'
  treatment: SurfaceTreatment
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

/** The clear spans the openings hosted by `wall` cut out of it, as centerline distances from its start. */
function openingSpans(wall: WallSceneNode, openings: readonly OpeningSceneNode[]): WallFaceGap[] {
  const hostId = rawWallId(wall)
  return openings
    .filter((opening) => opening.hostWallId === hostId)
    .map((opening) => {
      const jambs = openingJambs(opening)
      return {
        from: projectPointOntoWall(wall.start, wall.end, jambs.start),
        to: projectPointOntoWall(wall.start, wall.end, jambs.end),
      }
    })
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
  wall: WallSceneNode,
  openings: readonly OpeningSceneNode[],
): WallFaceStretch[] {
  const left = offsetBand(wall, 'left')
  const right = offsetBand(wall, 'right')
  return wallFaceGeometry({
    start: wall.start,
    end: wall.end,
    corners: { aPlus: left.from, bPlus: left.to, aMinus: right.from, bMinus: right.to },
    gaps: openingSpans(wall, openings),
  })
}

/** The parts of one side's face band left standing between `wall`'s openings, in order from its start. */
function faceBands(
  wall: WallSceneNode,
  side: 'left' | 'right',
  openings: readonly OpeningSceneNode[],
): { from: Point; to: Point }[] {
  return bandStretches(wall, openings).map((stretch) => {
    const face = side === 'left' ? stretch.plusFace : stretch.minusFace
    return { from: face[0], to: face[1] }
  })
}

/** Stroke each standing part of one wall face's band in the treatment color. */
function strokeBand(painter: SurfacePainter, face: PaintedFace): void {
  const { wall, side, treatment } = face
  if (treatment.kind !== 'solid') {
    return
  }
  painter.ctx.strokeStyle = treatment.color.srgbHex
  painter.ctx.lineWidth = BAND_LINE_WIDTH
  for (const band of faceBands(wall, side, painter.openings)) {
    strokeSegment(painter, band.from, band.to)
  }
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

/**
 * Stroke the brass accent centerline over the active wall so the user sees the
 * painted target. It runs the whole wall, openings included: it names which wall
 * is being painted rather than marking a face, and a wall with a door in it is
 * still one wall.
 */
function drawActiveHighlight(painter: SurfacePainter, layer: SurfacePaintLayer): void {
  const wall = activeWall(layer)
  if (wall === undefined) {
    return
  }
  painter.ctx.strokeStyle = ACTIVE_HIGHLIGHT_COLOR
  painter.ctx.lineWidth = ACTIVE_HIGHLIGHT_WIDTH
  strokeSegment(painter, wall.start, wall.end)
}

/** The wall (with the face side) matching the highlighted wall-face surface, or undefined when none. */
function highlightedWall(
  layer: SurfacePaintLayer,
): { wall: WallSceneNode; side: 'left' | 'right' } | undefined {
  const highlighted = layer.highlightedSurface
  if (highlighted === null || highlighted === undefined || highlighted.kind !== 'wall-face') {
    return undefined
  }
  const wall = layer.walls.find((candidate) => rawWallId(candidate) === highlighted.wallId)
  if (wall === undefined) {
    return undefined
  }
  return { wall, side: highlighted.side }
}

/** Stroke the brass accent band along the highlighted wall face, even when that face is unpainted. */
function drawHighlightedFace(painter: SurfacePainter, layer: SurfacePaintLayer): void {
  const highlighted = highlightedWall(layer)
  if (highlighted === undefined) {
    return
  }
  painter.ctx.strokeStyle = ACTIVE_HIGHLIGHT_COLOR
  painter.ctx.lineWidth = HIGHLIGHT_BAND_WIDTH
  for (const band of faceBands(highlighted.wall, highlighted.side, painter.openings)) {
    strokeSegment(painter, band.from, band.to)
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
