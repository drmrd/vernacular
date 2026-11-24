import { drawOnNextRendererFrame, type AnimationLoopRenderer } from '../../engine'
import { SCENE_READY_ATTRIBUTE } from './scene-readiness'
import type { TextureStatus } from './texture-cache'

/** The counts of the ready frame of the harness: renderer passes run and draws issued in it. */
export interface HarnessReadyFrame {
  renderCalls: number
  drawCalls: number
}

/** The renderer as the harness reads it: the loop accessors and the counts of the last frame. */
export type HarnessRenderer = AnimationLoopRenderer & {
  info: { render: { frameCalls: number; drawCalls: number } }
}

const RENDER_CALLS_ATTRIBUTE = 'data-harness-ready-render-calls'
const DRAW_CALLS_ATTRIBUTE = 'data-harness-ready-draw-calls'
const GROUND_TEXTURE_ATTRIBUTE = 'data-ground-texture'

/**
 * The four attributes of the harness wrapper. With the counts a reader of a capture
 * can check that the ready frame ran every pass of its pipeline, on a frame of its own: a frame
 * that shared its renderer frame with another draw, or skipped a pass, shows a different count.
 * Before the ready frame is drawn the two counts are empty strings. The fourth attribute reports
 * the ground texture status the harness has applied to the drawn root.
 */
export function harnessReadyProps(
  frame: HarnessReadyFrame | null,
  groundTexture: TextureStatus,
): Record<string, string> {
  return {
    [SCENE_READY_ATTRIBUTE]: frame === null ? 'false' : 'true',
    [RENDER_CALLS_ATTRIBUTE]: frame === null ? '' : String(frame.renderCalls),
    [DRAW_CALLS_ATTRIBUTE]: frame === null ? '' : String(frame.drawCalls),
    [GROUND_TEXTURE_ATTRIBUTE]: groundTexture,
  }
}

/**
 * Draws the harness frame on the renderer's next frame and returns a cancel for the pending request.
 * Without `onReadyFrame` that is one draw and no report. With it, the first frame is a settle frame
 * that reports nothing, and the report comes from the frame after it: one-time work, such as the
 * filter of the environment map, lands in the first draw that sees it, so the reported counts are
 * those of a steady-state frame. The cancel stops whichever of the two frames is still pending.
 */
export function drawHarnessFrame(
  renderer: HarnessRenderer,
  draw: () => void,
  onReadyFrame?: (frame: HarnessReadyFrame) => void,
): () => void {
  if (onReadyFrame === undefined) return drawOnNextRendererFrame(renderer, draw)
  let cancelPending = drawOnNextRendererFrame(renderer, () => {
    draw()
    cancelPending = drawOnNextRendererFrame(renderer, () => {
      draw()
      // The renderer reset both counts at the start of this callback, so they are this frame's.
      const { frameCalls, drawCalls } = renderer.info.render
      onReadyFrame({ renderCalls: frameCalls, drawCalls })
    })
  })
  return () => cancelPending()
}
