import type { UnderlaySceneNode } from '../../core'
import type { PlanDrawingContext } from './draw-plan'
import { worldToScreen, type Viewport } from './viewport'

/** The narrow structural slice of a decoded bitmap that drawImage needs (a real ImageBitmap satisfies it). */
export type UnderlayImage = { readonly width: number; readonly height: number }

const FULLY_OPAQUE = 1 // restore alpha after the dimmed underlay draw so later strokes are not dimmed

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
