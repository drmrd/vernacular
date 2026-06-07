import type { Point, UnderlaySceneNode } from '../../core'
import type { PlanDrawingContext, PreviewSegment } from './draw-plan'
import { worldToScreen, type Viewport } from './viewport'

/** The narrow structural slice of a decoded bitmap that drawImage needs (a real ImageBitmap satisfies it). */
export type UnderlayImage = { readonly width: number; readonly height: number }

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
  // Axis-aligned only this slice (node.placement.rotation === 0); rotation is deferred to the rotation-gizmo follow-up.
  const origin = worldToScreen(node.placement.offset, viewport)
  const pixelToScreen = node.placement.millimetersPerPixel * viewport.scale
  ctx.globalAlpha = node.opacity
  // UnderlayImage is the structural slice (width/height) drawImage reads; a real
  // ImageBitmap satisfies the seam's CanvasImageSource, so widen at the call.
  ctx.drawImage(
    image as CanvasImageSource,
    origin.x,
    origin.y,
    node.width * pixelToScreen,
    node.height * pixelToScreen,
  )
  ctx.globalAlpha = FULLY_OPAQUE
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
