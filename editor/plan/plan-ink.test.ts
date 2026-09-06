import { describe, it, expect } from 'vitest'
import { PLAN_INK_EMPHASIS, PLAN_INK_OVERLAY_WIDTH, PLAN_INK_WIDTH } from './plan-ink'

describe('PLAN_INK_WIDTH', () => {
  it('defines the cut/fixture/annotation ink-weight hierarchy from heaviest to lightest', () => {
    expect(PLAN_INK_WIDTH).toEqual({ cut: 2.5, fixture: 1.5, annotation: 1 })
    expect(PLAN_INK_WIDTH.cut).toBeGreaterThan(PLAN_INK_WIDTH.fixture)
    expect(PLAN_INK_WIDTH.fixture).toBeGreaterThan(PLAN_INK_WIDTH.annotation)
  })
})

describe('PLAN_INK_EMPHASIS', () => {
  it('is the one-pixel step a highlight adds to the weight of the ink it marks', () => {
    expect(PLAN_INK_EMPHASIS).toBe(1)
  })
})

describe('PLAN_INK_OVERLAY_WIDTH', () => {
  it('draws a transient overlay one emphasis step above the annotation weight', () => {
    expect(PLAN_INK_OVERLAY_WIDTH).toBe(2)
  })

  it('reads over the annotation layer without claiming the cut plane weight', () => {
    expect(PLAN_INK_OVERLAY_WIDTH).toBeGreaterThan(PLAN_INK_WIDTH.annotation)
    expect(PLAN_INK_OVERLAY_WIDTH).toBeLessThan(PLAN_INK_WIDTH.cut)
  })
})
