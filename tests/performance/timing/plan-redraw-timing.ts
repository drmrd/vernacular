import {
  drawPlan,
  type DrawPlanOptions,
  type PlanDrawingContext,
} from '../../../editor/plan/draw-plan'
import type { SampleCounts } from './timing-record'

/** What one plan redraw measurement needs. */
export interface PlanRedrawTiming {
  ctx: PlanDrawingContext
  frames: readonly DrawPlanOptions[]
  counts: SampleCounts
  now: () => number
  /** Resolves when the next animation frame starts; `requestAnimationFrame` in the page. */
  nextFrame: () => Promise<void>
}

function frameAt(frames: readonly DrawPlanOptions[], drawIndex: number): DrawPlanOptions {
  const frame = frames[drawIndex % frames.length]
  if (frame === undefined) {
    throw new Error('A plan redraw timing needs at least one frame')
  }
  return frame
}

/**
 * The durations, in milliseconds, of the timed plan redraws: one sample for each timed frame.
 *
 * The warm-up draws come first, untimed, with no clock read. Each draw waits for `nextFrame()`,
 * so one draw happens in each animation frame. Draw number i uses frame number i, the warm-up
 * draws included, and the list is cycled when it is shorter than the draws. Each figure is the
 * main-thread time of the draw calls of one `drawPlan`, from just before the call to its return.
 * The wait for the frame, the choice of the frame, and the bookkeeping of the sample are outside
 * it, and so is the raster that the browser does later.
 */
export async function timePlanRedraw(timing: PlanRedrawTiming): Promise<number[]> {
  const { ctx, frames, counts, now, nextFrame } = timing
  const samples: number[] = []
  for (let drawIndex = 0; drawIndex < counts.warmup + counts.timed; drawIndex++) {
    await nextFrame()
    const options = frameAt(frames, drawIndex)
    if (drawIndex < counts.warmup) {
      drawPlan(ctx, options)
    } else {
      const startMs = now()
      drawPlan(ctx, options)
      samples.push(now() - startMs)
    }
  }
  return samples
}
