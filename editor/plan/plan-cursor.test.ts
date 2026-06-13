import { describe, it, expect } from 'vitest'
import { planCursor } from './plan-cursor'

describe('planCursor', () => {
  it('shows the closed hand while panning with the Select tool', () => {
    expect(planCursor('select', true)).toBe('grabbing')
  })

  it('shows the closed hand while panning regardless of the active tool', () => {
    expect(planCursor('draw-wall', true)).toBe('grabbing')
  })

  it('advertises drag-to-pan with the open hand for the Select tool when idle', () => {
    expect(planCursor('select', false)).toBe('grab')
  })

  it('shows a crosshair for the wall tool when idle', () => {
    expect(planCursor('draw-wall', false)).toBe('crosshair')
  })

  it('shows a crosshair for the opening-placement tool when idle', () => {
    expect(planCursor('place-opening', false)).toBe('crosshair')
  })

  it('shows a crosshair for the dimension tool when idle', () => {
    expect(planCursor('dimension', false)).toBe('crosshair')
  })

  it('shows a crosshair for the calibration tool when idle', () => {
    expect(planCursor('calibrate', false)).toBe('crosshair')
  })
})
