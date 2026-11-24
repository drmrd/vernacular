import { describe, expect, it, vi } from 'vitest'

import { drawHarnessFrame } from './scene-harness-ready-frame'
import { createStandInRenderer, type StandInRenderer } from './scene-harness-view-test-support'

interface FrameCounts {
  frameCalls: number
  drawCalls: number
}

const SETTLE_FRAME_CALLS: FrameCounts = { frameCalls: 18, drawCalls: 140 }
const READY_FRAME_CALLS: FrameCounts = { frameCalls: 5, drawCalls: 127 }

// A draw that sets the counts of the frame it runs in, one entry per draw; the first entry can
// carry one-time work such as an environment-map filter.
function drawsWithCounts(renderer: StandInRenderer, frames: FrameCounts[]) {
  let drawn = 0
  return vi.fn(() => {
    Object.assign(renderer.info.render, frames[drawn])
    drawn += 1
  })
}

describe('drawHarnessFrame', () => {
  it('draws once on the next renderer frame and reports nothing without a ready-frame callback', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()

    drawHarnessFrame(renderer, draw)
    expect(draw).not.toHaveBeenCalled()
    renderer.runFrame()
    renderer.runFrame()

    expect(draw).toHaveBeenCalledTimes(1)
    expect(renderer.getAnimationLoop()).toBeNull()
  })

  it('draws a settle frame on the next renderer frame and reports nothing for it', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()
    const onReadyFrame = vi.fn()

    drawHarnessFrame(renderer, draw, onReadyFrame)
    renderer.runFrame()

    expect(draw).toHaveBeenCalledTimes(1)
    expect(onReadyFrame).not.toHaveBeenCalled()
  })

  it("reports the counts of the second frame, not of the settle frame's one-time work", () => {
    const renderer = createStandInRenderer()
    const draw = drawsWithCounts(renderer, [SETTLE_FRAME_CALLS, READY_FRAME_CALLS])
    const onReadyFrame = vi.fn()

    drawHarnessFrame(renderer, draw, onReadyFrame)
    renderer.runFrame()
    renderer.runFrame()

    expect(draw).toHaveBeenCalledTimes(2)
    expect(onReadyFrame).toHaveBeenCalledTimes(1)
    expect(onReadyFrame).toHaveBeenCalledWith({
      renderCalls: READY_FRAME_CALLS.frameCalls,
      drawCalls: READY_FRAME_CALLS.drawCalls,
    })
  })

  it('draws nothing once it is cancelled before the first renderer frame', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()
    const onReadyFrame = vi.fn()

    const cancel = drawHarnessFrame(renderer, draw, onReadyFrame)
    cancel()
    renderer.runFrame()
    renderer.runFrame()

    expect(draw).not.toHaveBeenCalled()
    expect(onReadyFrame).not.toHaveBeenCalled()
  })

  it('skips the second draw and the report once it is cancelled between the frames', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()
    const onReadyFrame = vi.fn()

    const cancel = drawHarnessFrame(renderer, draw, onReadyFrame)
    renderer.runFrame()
    cancel()
    renderer.runFrame()

    expect(draw).toHaveBeenCalledTimes(1)
    expect(onReadyFrame).not.toHaveBeenCalled()
    expect(renderer.getAnimationLoop()).toBeNull()
  })

  it('replaces a pending request with a later one, because a renderer keeps one loop', () => {
    const renderer = createStandInRenderer()
    const earlier = vi.fn()
    const later = vi.fn()
    const earlierReport = vi.fn()
    const laterReport = vi.fn()

    drawHarnessFrame(renderer, earlier, earlierReport)
    drawHarnessFrame(renderer, later, laterReport)
    renderer.runFrame()
    renderer.runFrame()

    expect(earlier).not.toHaveBeenCalled()
    expect(earlierReport).not.toHaveBeenCalled()
    expect(later).toHaveBeenCalledTimes(2)
    expect(laterReport).toHaveBeenCalledTimes(1)
  })
})
