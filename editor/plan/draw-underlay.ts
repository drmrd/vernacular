import type { Point, UnderlaySceneNode } from '../../core'
import type { PlanDrawingContext, PreviewSegment } from './draw-plan'
import { underlayTracePoints } from './underlay-trace-points'
import { worldToScreen, type Viewport } from './viewport'

/** The narrow structural slice of a decoded bitmap that drawImage needs (a real ImageBitmap satisfies it). */
export type UnderlayImage = { readonly width: number; readonly height: number }

/** An underlay scene node paired with its resolved decoded bitmap, ready to paint. */
export interface DrawableUnderlay {
  node: UnderlaySceneNode
  image: UnderlayImage
}

const FULLY_OPAQUE = 1 // restore alpha after the dimmed underlay draw so later strokes are not dimmed

// Distinct amber for the calibration measure line and its endpoint markers, set apart from the snap marker's orange.
const CALIBRATION_COLOR = '#e8590c'
const CALIBRATION_LINE_WIDTH = 2
const CALIBRATION_MARKER_RADIUS_PX = 4
const FULL_CIRCLE = Math.PI * 2

// eslint-disable-next-line max-params -- the four collaborators (context, node, viewport, image) are each irreducible inputs to one draw call
export function drawUnderlay(
  ctx: PlanDrawingContext,
  node: UnderlaySceneNode,
  viewport: Viewport,
  image: UnderlayImage,
): void {
  const pixelToScreen = node.placement.millimetersPerPixel * viewport.scale
  ctx.globalAlpha = node.opacity
  if (node.placement.rotation === 0) {
    // Axis-aligned: a plain drawImage at the projected offset, unchanged from the original path.
    // UnderlayImage is the structural slice (width/height) drawImage reads; a real
    // ImageBitmap satisfies the seam's CanvasImageSource, so widen at the call.
    const origin = worldToScreen(node.placement.offset, viewport)
    ctx.drawImage(
      image as CanvasImageSource,
      origin.x,
      origin.y,
      node.width * pixelToScreen,
      node.height * pixelToScreen,
    )
  } else {
    // Project the footprint corners the snap path already uses, then paint the raster into that rotated quad.
    const corners = underlayTracePoints(node).map((corner) => worldToScreen(corner, viewport))
    const topLeft = corners[0]
    const topRight = corners[1]
    const bottomLeft = corners[3]
    if (topLeft === undefined || topRight === undefined || bottomLeft === undefined) return // unreachable; satisfies strict indexing
    const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x)
    const widthScreen = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
    const heightScreen = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y)
    ctx.save()
    ctx.translate(topLeft.x, topLeft.y)
    ctx.rotate(angle)
    ctx.drawImage(image as CanvasImageSource, 0, 0, widthScreen, heightScreen)
    ctx.restore()
  }
  ctx.globalAlpha = FULLY_OPAQUE
}

/** Paints each visible underlay as the bottom layer; a missing or empty list paints nothing. */
export function drawUnderlays(
  ctx: PlanDrawingContext,
  underlays: readonly DrawableUnderlay[] | undefined,
  viewport: Viewport,
): void {
  for (const drawable of underlays ?? []) {
    if (drawable.node.visible) {
      drawUnderlay(ctx, drawable.node, viewport, drawable.image)
    }
  }
}

/** Paints the calibration measure line when one is in progress; no-ops when absent. */
export function drawCalibration(
  ctx: PlanDrawingContext,
  segment: PreviewSegment | undefined,
  viewport: Viewport,
): void {
  if (segment) {
    drawCalibrationSegment(ctx, segment, viewport)
  }
}

/** Paint the calibration measure line and a filled marker at each of its screen endpoints. */
export function drawCalibrationSegment(
  ctx: PlanDrawingContext,
  segment: PreviewSegment,
  viewport: Viewport,
): void {
  const start = worldToScreen(segment.start, viewport)
  const end = worldToScreen(segment.end, viewport)
  ctx.strokeStyle = CALIBRATION_COLOR
  ctx.lineWidth = CALIBRATION_LINE_WIDTH
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  drawCalibrationMarker(ctx, start)
  drawCalibrationMarker(ctx, end)
}

function drawCalibrationMarker(ctx: PlanDrawingContext, center: Point): void {
  ctx.fillStyle = CALIBRATION_COLOR
  ctx.beginPath()
  ctx.arc(center.x, center.y, CALIBRATION_MARKER_RADIUS_PX, 0, FULL_CIRCLE)
  ctx.fill()
}
