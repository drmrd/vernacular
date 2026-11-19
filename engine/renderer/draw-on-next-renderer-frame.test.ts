import { describe, expect, it, vi } from 'vitest'

import { drawOnNextRendererFrame, type AnimationLoopRenderer } from './draw-on-next-renderer-frame'

interface StandInRenderer extends AnimationLoopRenderer {
  runFrame(): void
}

function createStandInRenderer(): StandInRenderer {
  let loop: (() => void) | null = null
  return {
    setAnimationLoop(callback) {
      loop = callback
    },
    getAnimationLoop() {
      return loop
    },
    runFrame() {
      loop?.()
    },
  }
}

describe('drawOnNextRendererFrame', () => {
  it("does not draw before the renderer's next animation-loop callback", () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()

    drawOnNextRendererFrame(renderer, draw)

    expect(draw).not.toHaveBeenCalled()
  })

  it('draws once in the next animation-loop callback and then clears the loop', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()

    drawOnNextRendererFrame(renderer, draw)
    renderer.runFrame()
    renderer.runFrame()

    expect(draw).toHaveBeenCalledTimes(1)
    expect(renderer.getAnimationLoop()).toBeNull()
  })

  it('replaces a pending draw with a later request, so the frame draws only the later one', () => {
    const renderer = createStandInRenderer()
    const earlier = vi.fn()
    const later = vi.fn()

    drawOnNextRendererFrame(renderer, earlier)
    drawOnNextRendererFrame(renderer, later)
    renderer.runFrame()

    expect(earlier).not.toHaveBeenCalled()
    expect(later).toHaveBeenCalledTimes(1)
  })

  it('draws nothing once a pending draw is cancelled', () => {
    const renderer = createStandInRenderer()
    const draw = vi.fn()

    const cancel = drawOnNextRendererFrame(renderer, draw)
    cancel()
    renderer.runFrame()

    expect(draw).not.toHaveBeenCalled()
    expect(renderer.getAnimationLoop()).toBeNull()
  })

  it('leaves a later pending draw in place when an earlier request is cancelled', () => {
    const renderer = createStandInRenderer()
    const earlier = vi.fn()
    const later = vi.fn()

    const cancelEarlier = drawOnNextRendererFrame(renderer, earlier)
    drawOnNextRendererFrame(renderer, later)
    cancelEarlier()
    renderer.runFrame()

    expect(later).toHaveBeenCalledTimes(1)
  })

  it('clears the loop even when the draw throws', () => {
    const renderer = createStandInRenderer()

    drawOnNextRendererFrame(renderer, () => {
      throw new Error('the draw failed')
    })

    expect(() => renderer.runFrame()).toThrow('the draw failed')
    expect(renderer.getAnimationLoop()).toBeNull()
  })
})
