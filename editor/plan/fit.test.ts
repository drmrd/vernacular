import { describe, it, expect } from 'vitest'
import { contentBounds, computeFitViewport, planExtent } from './fit'
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

  it('orients the fitted content y-up so the world top sits at the top of the canvas', () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } }

    const vp = computeFitViewport(bounds, { width: 800, height: 600 }, 24)

    // The world max-y corner (the top of the content) must land at a smaller
    // screen y than the world min-y corner (the bottom of the content).
    expect(worldToScreen({ x: 0, y: 3000 }, vp).y).toBeLessThan(worldToScreen({ x: 0, y: 0 }, vp).y)
  })

  it('keeps the scale within the zoom limits for a degenerate single-point bounds', () => {
    const bounds = { min: { x: 100, y: 100 }, max: { x: 100, y: 100 } }

    const viewport = computeFitViewport(bounds, { width: 800, height: 600 })

    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.scale).toBeLessThanOrEqual(4)
  })
})

describe('planExtent', () => {
  it('returns null when nothing is drawn', () => {
    expect(planExtent([], [])).toBeNull()
  })

  it('measures the bounding width and height across walls and rooms', () => {
    const walls = [{ start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } }]
    const rooms = [
      {
        polygon: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
      },
    ]

    // The wall reaches further right than the room (5000 vs 4000) while the room
    // reaches further down than the wall (3000 vs 0), so the extent spans both.
    expect(planExtent(walls, rooms)).toEqual({ width: 5000, height: 3000 })
  })
})
