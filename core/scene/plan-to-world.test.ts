import { describe, it, expect } from 'vitest'
import { planToWorld } from './plan-to-world'

describe('planToWorld', () => {
  it('maps plan (x, y) at height v to world (x, v, y)', () => {
    expect(planToWorld({ x: 3, y: 7 }, 2700)).toEqual({ x: 3, y: 2700, z: 7 })
  })

  it('places a point on the finished floor at world Y = 0', () => {
    expect(planToWorld({ x: -1, y: 4 }, 0)).toEqual({ x: -1, y: 0, z: 4 })
  })
})
