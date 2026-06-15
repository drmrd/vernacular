import { describe, it, expect } from 'vitest'
import {
  worldToScreen,
  screenToWorld,
  panBy,
  clampScale,
  zoomAtCursor,
  wheelZoomFactor,
  axisProjection,
  axisSamples,
  zoomPercent,
  DEFAULT_PLAN_SCALE,
  MIN_PLAN_SCALE,
  MAX_PLAN_SCALE,
} from './viewport'

describe('viewport projection', () => {
  it('scales world millimeters to screen pixels', () => {
    const viewport = { scale: 0.1 }

    expect(worldToScreen({ x: 1000, y: 2000 }, viewport)).toEqual({ x: 100, y: 200 })
  })

  it('round-trips screen back to world', () => {
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    const screen = worldToScreen({ x: 1234, y: 5678 }, viewport)

    expect(screenToWorld(screen, viewport)).toEqual({ x: 1234, y: 5678 })
  })

  it('exposes a positive default scale', () => {
    expect(DEFAULT_PLAN_SCALE).toBeGreaterThan(0)
  })
})

describe('viewport pan offset', () => {
  it('translates the scaled world point by the screen-pixel offset', () => {
    const viewport = { scale: 0.1, offset: { x: 30, y: -20 } }

    expect(worldToScreen({ x: 1000, y: 2000 }, viewport)).toEqual({ x: 130, y: 180 })
  })

  it('round-trips screen back to world under pan and zoom', () => {
    const viewport = { scale: 0.08, offset: { x: 45, y: 60 } }
    const screen = worldToScreen({ x: 1234, y: 5678 }, viewport)

    expect(screenToWorld(screen, viewport)).toEqual({ x: 1234, y: 5678 })
  })
})

describe('panBy', () => {
  it('treats an absent offset as the origin, yielding the delta', () => {
    expect(panBy({ scale: 0.1 }, { x: 12, y: -8 }).offset).toEqual({ x: 12, y: -8 })
  })

  it('accumulates the screen-pixel delta onto an existing offset', () => {
    expect(panBy({ scale: 0.1, offset: { x: 5, y: 5 } }, { x: 10, y: 20 }).offset).toEqual({
      x: 15,
      y: 25,
    })
  })

  it('leaves the scale unchanged', () => {
    expect(panBy({ scale: 0.1 }, { x: 10, y: 10 }).scale).toBe(0.1)
  })
})

describe('clampScale', () => {
  it('raises a below-minimum scale up to the minimum', () => {
    expect(clampScale(MIN_PLAN_SCALE / 10)).toBe(MIN_PLAN_SCALE)
  })

  it('lowers an above-maximum scale down to the maximum', () => {
    expect(clampScale(MAX_PLAN_SCALE * 10)).toBe(MAX_PLAN_SCALE)
  })

  it('passes an in-range scale through unchanged', () => {
    expect(clampScale(0.1)).toBe(0.1)
  })
})

describe('zoomAtCursor', () => {
  it('scales by the factor and keeps the world point under the cursor fixed', () => {
    const viewport = { scale: 0.1, offset: { x: 0, y: 0 } }
    const cursor = { x: 300, y: 200 }
    const worldUnder = screenToWorld(cursor, viewport)

    const zoomed = zoomAtCursor(viewport, cursor, 2)

    expect(zoomed.scale).toBe(0.2)
    const after = worldToScreen(worldUnder, zoomed)
    expect(after.x).toBeCloseTo(cursor.x, 6)
    expect(after.y).toBeCloseTo(cursor.y, 6)
  })

  it('clamps the scaled result to the maximum', () => {
    const zoomed = zoomAtCursor(
      { scale: MAX_PLAN_SCALE, offset: { x: 0, y: 0 } },
      { x: 0, y: 0 },
      4,
    )

    expect(zoomed.scale).toBe(MAX_PLAN_SCALE)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in for an upward scroll (negative deltaY)', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
  })

  it('zooms out for a downward scroll (positive deltaY)', () => {
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('holds the scale steady at rest (deltaY of zero)', () => {
    expect(wheelZoomFactor(0)).toBe(1)
  })

  it('moves the factor further from 1 as the upward scroll grows', () => {
    expect(wheelZoomFactor(-50)).toBeLessThan(wheelZoomFactor(-100))
  })

  it('moves the factor further from 1 as the downward scroll grows', () => {
    expect(wheelZoomFactor(50)).toBeGreaterThan(wheelZoomFactor(100))
  })
})

describe('axisProjection', () => {
  it('reads the horizontal axis as the viewport scale and x-offset', () => {
    const viewport = { scale: 0.1, offset: { x: 30, y: -20 } }

    expect(axisProjection(viewport, 'horizontal')).toEqual({ scale: 0.1, translate: 30 })
  })

  it('reads the vertical axis as the viewport scale and y-offset', () => {
    const viewport = { scale: 0.1, offset: { x: 30, y: -20 } }

    expect(axisProjection(viewport, 'vertical')).toEqual({ scale: 0.1, translate: -20 })
  })
})

describe('axisSamples', () => {
  it('steps world multiples of the spacing across the visible length, projected to screen', () => {
    const samples = axisSamples({ scale: 0.1, translate: 0 }, 100, 200)

    expect(samples.map((sample) => sample.worldValue)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(samples.map((sample) => sample.screen)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('includes only multiples within the visible range when the axis is panned', () => {
    // screen = world * 0.1 - 50, so the visible world range is [500, 1500]
    const samples = axisSamples({ scale: 0.1, translate: -50 }, 100, 500)

    expect(samples.map((sample) => sample.worldValue)).toEqual([500, 1000, 1500])
  })
})

describe('zoomPercent', () => {
  it('reads the default scale as 100 percent', () => {
    expect(zoomPercent(DEFAULT_PLAN_SCALE)).toBe(100)
  })

  it('doubles the percent when the scale doubles', () => {
    expect(zoomPercent(DEFAULT_PLAN_SCALE * 2)).toBe(200)
  })

  it('halves the percent when the scale halves', () => {
    expect(zoomPercent(DEFAULT_PLAN_SCALE / 2)).toBe(50)
  })

  it('rounds to the nearest whole percent', () => {
    expect(zoomPercent(DEFAULT_PLAN_SCALE * 1.333)).toBe(133)
  })
})
