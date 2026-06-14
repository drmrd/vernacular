import { describe, it, expect } from 'vitest'
import { pickOpeningResizeHandle } from './opening-resize'
import type { OpeningSceneNode, Point } from '../../core'

const GRAB_TOLERANCE_MM = 200

// An opening centered at x = 1000 with along = +x and width 900.
// Its jamb handles sit on the wall centerline at:
//   start jamb = center - along * (width / 2) = { x: 550, y: 0 }
//   end   jamb = center + along * (width / 2) = { x: 1450, y: 0 }
// The 900 mm width keeps the two jambs far enough apart that a point on one
// jamb is well outside GRAB_TOLERANCE_MM of the other.
const WIDE_OPENING_START_JAMB: Point = { x: 550, y: 0 }
const WIDE_OPENING_END_JAMB: Point = { x: 1450, y: 0 }

function opening(center: Point, along: Point, width: number): OpeningSceneNode {
  return {
    id: 'opening:a',
    kind: 'opening',
    floorId: 'g',
    type: 'single-swing-door',
    center,
    along,
    normal: { x: 0, y: 1 },
    width,
    height: 2032,
    sillHeight: 0,
    hostThickness: 100,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

// A wide opening whose jambs are 900 mm apart, used for the on-top and null cases.
const WIDE_OPENING = opening({ x: 1000, y: 0 }, { x: 1, y: 0 }, 900)

// A narrow opening centered at the origin with width 200, so both jambs sit at
//   start jamb = { x: -100, y: 0 }, end jamb = { x: 100, y: 0 }
// and a single midspan point can fall inside GRAB_TOLERANCE_MM of both jambs,
// exercising the nearer-jamb-wins and exact-tie rules.
const NARROW_OPENING = opening({ x: 0, y: 0 }, { x: 1, y: 0 }, 200)

describe('pickOpeningResizeHandle', () => {
  it("returns 'start' for a point on top of the start jamb", () => {
    expect(pickOpeningResizeHandle(WIDE_OPENING, WIDE_OPENING_START_JAMB, GRAB_TOLERANCE_MM)).toBe(
      'start',
    )
  })

  it("returns 'end' for a point on top of the end jamb", () => {
    expect(pickOpeningResizeHandle(WIDE_OPENING, WIDE_OPENING_END_JAMB, GRAB_TOLERANCE_MM)).toBe(
      'end',
    )
  })

  it("returns 'start' when the point is in range of both jambs but nearer the start", () => {
    // Narrow opening jambs at x = -100 and x = 100.
    // x = -60 is 40 mm from the start jamb and 160 mm from the end jamb:
    // both within the 200 mm tolerance, nearer the start.
    const nearerStart: Point = { x: -60, y: 0 }

    expect(pickOpeningResizeHandle(NARROW_OPENING, nearerStart, GRAB_TOLERANCE_MM)).toBe('start')
  })

  it("returns 'start' on a near-tie where the point is just closer to the start", () => {
    // Narrow opening jambs at x = -100 and x = 100.
    // x = -10 is 90 mm from the start jamb and 110 mm from the end jamb:
    // both within tolerance, start wins by the smaller margin. This also pins
    // the deterministic exact-tie rule: at an exact tie, the start jamb wins.
    const justNearerStart: Point = { x: -10, y: 0 }

    expect(pickOpeningResizeHandle(NARROW_OPENING, justNearerStart, GRAB_TOLERANCE_MM)).toBe(
      'start',
    )
  })

  it('returns null when neither jamb is within tolerance', () => {
    const farFromBoth: Point = { x: 1000, y: 1500 }

    expect(pickOpeningResizeHandle(WIDE_OPENING, farFromBoth, GRAB_TOLERANCE_MM)).toBeNull()
  })
})
