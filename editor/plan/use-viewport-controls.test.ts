import { describe, it, expect } from 'vitest'
import { eventToCanvas } from './use-viewport-controls'

interface FakeCanvasRect {
  left: number
  top: number
  width: number
  height: number
}

// 800x600 backing store displayed at a 1.4x CSS scale (1120x840).
const BACKING_WIDTH = 800
const BACKING_HEIGHT = 600
const DISPLAY_SCALE = 1.4
const DISPLAY_WIDTH = BACKING_WIDTH * DISPLAY_SCALE
const DISPLAY_HEIGHT = BACKING_HEIGHT * DISPLAY_SCALE

/**
 * Minimal stand-in for the plan canvas. The backing store (`width`/`height`) and the
 * displayed CSS rect can differ, which is exactly the condition `eventToCanvas` must
 * account for by scaling.
 */
function fakeCanvas(
  backingStore: { width: number; height: number },
  rect: FakeCanvasRect,
): HTMLCanvasElement {
  return {
    width: backingStore.width,
    height: backingStore.height,
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as HTMLCanvasElement
}

describe('eventToCanvas', () => {
  it('scales a centered pointer into the center of a larger-displayed backing store', () => {
    // Displayed at 1.4x scale with no offset.
    const canvas = fakeCanvas(
      { width: BACKING_WIDTH, height: BACKING_HEIGHT },
      { left: 0, top: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
    )

    // The center of the displayed canvas.
    const point = eventToCanvas({ clientX: DISPLAY_WIDTH / 2, clientY: DISPLAY_HEIGHT / 2 }, canvas)

    // The center of the 800x600 backing store, not the unscaled displayed point.
    expect(point).toEqual({ x: BACKING_WIDTH / 2, y: BACKING_HEIGHT / 2 })
  })

  it('composes offset subtraction and scaling at a nonzero, off-origin point', () => {
    // Same 1.4x display scale, but the canvas sits 100px right and 40px down.
    const rectLeft = 100
    const rectTop = 40
    const canvas = fakeCanvas(
      { width: BACKING_WIDTH, height: BACKING_HEIGHT },
      { left: rectLeft, top: rectTop, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
    )

    // Pointer at the displayed center: offset-subtracted to (560, 420) in displayed pixels.
    const point = eventToCanvas(
      { clientX: rectLeft + DISPLAY_WIDTH / 2, clientY: rectTop + DISPLAY_HEIGHT / 2 },
      canvas,
    )

    // Scaling must follow the offset subtraction: (560, 420) / 1.4 -> the backing-store
    // center, not the unscaled { x: 560, y: 420 }.
    expect(point).toEqual({ x: BACKING_WIDTH / 2, y: BACKING_HEIGHT / 2 })
  })
})
