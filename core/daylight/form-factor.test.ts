// core/daylight/form-factor.test.ts
import { describe, expect, it } from 'vitest'
import { horizontalPointToWallRectangle, visibleThroughReveal } from './form-factor'
import type { WallRectangle } from './form-factor'

const TOLERANCE = 1e-6
const REVEAL_TOLERANCE = 0.01
const DISTANCE = 1000
const REVEAL_DEPTH = 120
const HUGE = 1e12

const UNIT_SQUARE: WallRectangle = { x0: 0, x1: 1000, z0: 0, z1: 1000 }
const WINDOW: WallRectangle = { x0: -500, x1: 500, z0: 50, z1: 1250 }

describe('horizontalPointToWallRectangle', () => {
  it('gives 0.055734 for a one meter square at one meter, from the foot of the point', () => {
    expect(Math.abs(horizontalPointToWallRectangle(UNIT_SQUARE, DISTANCE) - 0.055734)).toBeLessThan(
      TOLERANCE,
    )
  })

  it('gives 0.087041 for a window that straddles the foot and starts above the point', () => {
    expect(Math.abs(horizontalPointToWallRectangle(WINDOW, DISTANCE) - 0.087041)).toBeLessThan(
      TOLERANCE,
    )
  })

  it('tends to one quarter for an infinite quadrant that starts at the foot', () => {
    const quadrant: WallRectangle = { x0: 0, x1: HUGE, z0: 0, z1: HUGE }
    expect(Math.abs(horizontalPointToWallRectangle(quadrant, DISTANCE) - 0.25)).toBeLessThan(
      TOLERANCE,
    )
  })

  it('gives the same value when the rectangle is mirrored in x', () => {
    const mirrored: WallRectangle = { x0: -WINDOW.x1, x1: -WINDOW.x0, z0: WINDOW.z0, z1: WINDOW.z1 }
    expect(
      Math.abs(
        horizontalPointToWallRectangle(mirrored, DISTANCE) -
          horizontalPointToWallRectangle(WINDOW, DISTANCE),
      ),
    ).toBeLessThan(TOLERANCE)
  })

  it('never lowers the value when the rectangle is widened', () => {
    const widenings = [0, 100, 250, 500, 1000, 4000].map(
      (margin): WallRectangle => ({
        x0: WINDOW.x0 - margin,
        x1: WINDOW.x1 + margin,
        z0: WINDOW.z0 - Math.min(margin, WINDOW.z0),
        z1: WINDOW.z1 + margin,
      }),
    )
    const values = widenings.map((rectangle) => horizontalPointToWallRectangle(rectangle, DISTANCE))
    values.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(values[index]!)
    })
  })

  it('gives 0 for a rectangle wholly below the point', () => {
    const below: WallRectangle = { x0: -500, x1: 500, z0: -1200, z1: -100 }
    expect(horizontalPointToWallRectangle(below, DISTANCE)).toBe(0)
  })
})

describe('visibleThroughReveal', () => {
  it('shrinks the outer face toward the foot of the point and keeps the overlap', () => {
    const visible = visibleThroughReveal(WINDOW, { distance: DISTANCE, depth: REVEAL_DEPTH })
    expect(visible).not.toBeNull()
    expect(Math.abs(visible!.x0 - -446.43)).toBeLessThan(REVEAL_TOLERANCE)
    expect(Math.abs(visible!.x1 - 446.43)).toBeLessThan(REVEAL_TOLERANCE)
    expect(Math.abs(visible!.z0 - 50)).toBeLessThan(REVEAL_TOLERANCE)
    expect(Math.abs(visible!.z1 - 1116.07)).toBeLessThan(REVEAL_TOLERANCE)
  })

  it('gives 0.071836 for the form factor of the window seen through a 120 mm reveal', () => {
    const visible = visibleThroughReveal(WINDOW, { distance: DISTANCE, depth: REVEAL_DEPTH })
    expect(visible).not.toBeNull()
    expect(Math.abs(horizontalPointToWallRectangle(visible!, DISTANCE) - 0.071836)).toBeLessThan(
      TOLERANCE,
    )
  })

  it('gives null when the reveal hides the whole opening', () => {
    // The outer face scales by 1000 / 4000 = 0.25, to x in [125, 250], clear of x in [500, 1000].
    const offToTheSide: WallRectangle = { x0: 500, x1: 1000, z0: 500, z1: 1000 }
    expect(visibleThroughReveal(offToTheSide, { distance: DISTANCE, depth: 3000 })).toBeNull()
  })
})
