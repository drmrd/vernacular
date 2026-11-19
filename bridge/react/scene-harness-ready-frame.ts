import type { AnimationLoopRenderer } from '../../engine'
import { SCENE_READY_ATTRIBUTE } from './scene-readiness'

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

/**
 * The three readiness attributes of the harness wrapper. With the counts a reader of a capture
 * can check that the ready frame ran every pass of its pipeline, on a frame of its own: a frame
 * that shared its renderer frame with another draw, or skipped a pass, shows a different count.
 * Before the ready frame is drawn the two counts are empty strings.
 */
export function harnessReadyProps(frame: HarnessReadyFrame | null): Record<string, string> {
  return {
    [SCENE_READY_ATTRIBUTE]: frame === null ? 'false' : 'true',
    [RENDER_CALLS_ATTRIBUTE]: frame === null ? '' : String(frame.renderCalls),
    [DRAW_CALLS_ATTRIBUTE]: frame === null ? '' : String(frame.drawCalls),
  }
}
