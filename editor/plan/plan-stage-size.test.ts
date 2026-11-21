import { describe, it, expect } from 'vitest'
import { computeFitViewport, type Bounds } from './fit'
import { MIN_PLAN_STAGE_HEIGHT, MIN_PLAN_STAGE_WIDTH, resolveStageSize } from './plan-stage-size'
import { MAX_PLAN_SCALE, MIN_PLAN_SCALE, worldToScreen, type ViewportSize } from './viewport'

const PREVIOUS: ViewportSize = { width: 800, height: 600 }

describe('resolveStageSize', () => {
  it('resolves a measurement at or above the minimum to itself, each dimension floored to a whole pixel', () => {
    expect(resolveStageSize(PREVIOUS, { width: 1000.9, height: 700.4 })).toEqual({
      width: 1000,
      height: 700,
    })
    expect(
      resolveStageSize(PREVIOUS, { width: MIN_PLAN_STAGE_WIDTH, height: MIN_PLAN_STAGE_HEIGHT }),
    ).toEqual({ width: MIN_PLAN_STAGE_WIDTH, height: MIN_PLAN_STAGE_HEIGHT })
  })

  it('raises a dimension below the minimum to the minimum, for that dimension only', () => {
    expect(resolveStageSize(PREVIOUS, { width: MIN_PLAN_STAGE_WIDTH - 60, height: 500 })).toEqual({
      width: MIN_PLAN_STAGE_WIDTH,
      height: 500,
    })
    expect(resolveStageSize(PREVIOUS, { width: 900, height: MIN_PLAN_STAGE_HEIGHT - 50 })).toEqual({
      width: 900,
      height: MIN_PLAN_STAGE_HEIGHT,
    })
  })

  it.each([
    ['a zero width', { width: 0, height: 500 }],
    ['a zero height', { width: 900, height: 0 }],
    ['a negative width', { width: -20, height: 500 }],
    ['a negative height', { width: 900, height: -1 }],
    ['a NaN dimension', { width: Number.NaN, height: 500 }],
    ['an infinite dimension', { width: 900, height: Number.POSITIVE_INFINITY }],
  ])(
    'keeps the previous size, as the same object, for a measurement with %s',
    (_label, measured) => {
      expect(resolveStageSize(PREVIOUS, measured)).toBe(PREVIOUS)
    },
  )

  it('returns the previous object when the measurement equals the previous size', () => {
    expect(resolveStageSize(PREVIOUS, { width: 800, height: 600 })).toBe(PREVIOUS)
    expect(resolveStageSize(PREVIOUS, { width: 800.7, height: 600.2 })).toBe(PREVIOUS)
  })
})

describe('fitting content into the minimum stage', () => {
  const minimumStage: ViewportSize = {
    width: MIN_PLAN_STAGE_WIDTH,
    height: MIN_PLAN_STAGE_HEIGHT,
  }

  it.each<[string, Bounds]>([
    ['a typical room', { min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } }],
    ['a long thin hall', { min: { x: -9000, y: 100 }, max: { x: 21000, y: 1100 } }],
    ['a tiny footprint', { min: { x: 10, y: 10 }, max: { x: 60, y: 40 } }],
    ['a single point', { min: { x: 500, y: -500 }, max: { x: 500, y: -500 } }],
  ])(
    'gives a scale inside the clamp range and puts both corners on the stage for %s',
    (_label, bounds) => {
      const viewport = computeFitViewport(bounds, minimumStage)

      expect(viewport.scale).toBeGreaterThanOrEqual(MIN_PLAN_SCALE)
      expect(viewport.scale).toBeLessThanOrEqual(MAX_PLAN_SCALE)
      for (const corner of [bounds.min, bounds.max]) {
        const onScreen = worldToScreen(corner, viewport)
        expect(onScreen.x).toBeGreaterThanOrEqual(0)
        expect(onScreen.x).toBeLessThanOrEqual(minimumStage.width)
        expect(onScreen.y).toBeGreaterThanOrEqual(0)
        expect(onScreen.y).toBeLessThanOrEqual(minimumStage.height)
      }
    },
  )
})
