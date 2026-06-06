import { describe, it, expect } from 'vitest'
import { contentBounds, computeFitViewport } from './fit'
import { worldToScreen } from './viewport'

describe('contentBounds', () => {
  it('returns the axis-aligned bounds of the points', () => {
    expect(
      contentBounds([
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 1000, y: -500 },
      ]),
    ).toEqual({ min: { x: 0, y: -500 }, max: { x: 4000, y: 3000 } })
  })

  it('returns null when there are no points', () => {
    expect(contentBounds([])).toBeNull()
  })
})

describe('computeFitViewport', () => {
  it('fits the bounds within the padded canvas on the tighter axis and centers them', () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } }

    const viewport = computeFitViewport(bounds, { width: 800, height: 600 }, 24)

    // Padding leaves 752 px wide by 552 px tall; the height axis is tighter,
    // so the scale fits 3000 mm into 552 px.
    expect(viewport.scale).toBeCloseTo(552 / 3000, 9)
    // The world center maps to the canvas center.
    const center = worldToScreen({ x: 2000, y: 1500 }, viewport)
    expect(center.x).toBeCloseTo(400, 6)
    expect(center.y).toBeCloseTo(300, 6)
  })

  it('keeps the scale within the zoom limits for a degenerate single-point bounds', () => {
    const bounds = { min: { x: 100, y: 100 }, max: { x: 100, y: 100 } }

    const viewport = computeFitViewport(bounds, { width: 800, height: 600 })

    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.scale).toBeLessThanOrEqual(4)
  })
})
