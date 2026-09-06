import { describe, it, expect } from 'vitest'
import { drawGhost } from './draw-ghost'
import type { PreviewSegment } from './draw-plan'
import { recordingContext } from './draw-plan-test-fixtures'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'
import type { Viewport } from './viewport'

// A non-trivial scale and pan so the projection is observable rather than an
// identity map, mirroring the underlay and stair draw tests.
const VIEWPORT: Viewport = { scale: 0.05, offset: { x: 31, y: 47 } }
const RENDER = { viewport: VIEWPORT, palette: DEFAULT_PLAN_PALETTE }

// Two distinct world points so the projected screen endpoints differ in both axes.
const SEGMENT: PreviewSegment = { start: { x: 1200, y: 800 }, end: { x: 3400, y: 2600 } }

describe('drawGhost', () => {
  it('strokes the move-drag ghost at two pixels', () => {
    const recorder = recordingContext()

    drawGhost(recorder.ctx, [SEGMENT], RENDER)

    // A bare number, not an ink-table expression: this pins the painted width.
    expect(recorder.ctx.lineWidth).toBe(2)
  })
})
