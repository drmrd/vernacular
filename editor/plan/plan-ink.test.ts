import { describe, it, expect } from 'vitest'
import { PLAN_INK_WIDTH } from './plan-ink'

describe('PLAN_INK_WIDTH', () => {
  it('defines the cut/fixture/annotation ink-weight hierarchy from heaviest to lightest', () => {
    expect(PLAN_INK_WIDTH).toEqual({ cut: 2.5, fixture: 1.5, annotation: 1 })
    expect(PLAN_INK_WIDTH.cut).toBeGreaterThan(PLAN_INK_WIDTH.fixture)
    expect(PLAN_INK_WIDTH.fixture).toBeGreaterThan(PLAN_INK_WIDTH.annotation)
  })
})
