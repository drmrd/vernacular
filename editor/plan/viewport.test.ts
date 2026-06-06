import { describe, it, expect } from 'vitest'
import {
  worldToScreen,
  screenToWorld,
  panBy,
  clampScale,
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
