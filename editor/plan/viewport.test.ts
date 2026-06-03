import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, DEFAULT_PLAN_SCALE } from './viewport'

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
