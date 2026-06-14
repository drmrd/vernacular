import { describe, it, expect } from 'vitest'
import { pickOpeningResizeHandle, computeOpeningResize, snapJambToWallEnd } from './opening-resize'
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

// The opening used across the resize cases below: centered at 1000 mm along a
// 3000 mm wall with width 900, so its jambs sit at start = 550, end = 1450.
const OPENING_POSITION_MM = 1000
const OPENING_WIDTH_MM = 900
const WALL_LENGTH_MM = 3000
// Minimum opening width: the dragged jamb may never cross the fixed jamb closer
// than this.
const MIN_OPENING_WIDTH_MM = 50

describe('computeOpeningResize', () => {
  it('grows the opening when the end jamb is dragged away from the fixed start jamb', () => {
    // Fixed start jamb = 550; dragging the end jamb out to 1600 yields
    // width 1600 - 550 = 1050 and center (1600 + 550) / 2 = 1075.
    expect(
      computeOpeningResize({
        edge: 'end',
        draggedJambPosition: 1600,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 1050, position: 1075 })
  })

  it('shrinks the opening when the end jamb is dragged toward the fixed start jamb', () => {
    // Fixed start jamb = 550; dragging the end jamb in to 1200 yields
    // width 1200 - 550 = 650 and center (1200 + 550) / 2 = 875.
    expect(
      computeOpeningResize({
        edge: 'end',
        draggedJambPosition: 1200,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 650, position: 875 })
  })

  it('grows the opening when the start jamb is dragged away from the fixed end jamb', () => {
    // Fixed end jamb = 1450; dragging the start jamb out to 700 yields
    // width 1450 - 700 = 750 and center (700 + 1450) / 2 = 1075.
    expect(
      computeOpeningResize({
        edge: 'start',
        draggedJambPosition: 700,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 750, position: 1075 })
  })

  it('clamps the dragged jamb to the minimum width rather than crossing the fixed jamb', () => {
    // Fixed start jamb = 550; dragging the end jamb to 500 would fall below it,
    // so the end jamb is floored at 550 + minWidth = 600, giving width 50 and
    // center (600 + 550) / 2 = 575.
    expect(
      computeOpeningResize({
        edge: 'end',
        draggedJambPosition: 500,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 50, position: 575 })
  })

  it('clamps the dragged jamb to the wall end when dragged past it', () => {
    // Fixed start jamb = 550; dragging the end jamb to 3500 is clamped to the
    // wall length 3000, giving width 3000 - 550 = 2450 and center
    // (3000 + 550) / 2 = 1775.
    expect(
      computeOpeningResize({
        edge: 'end',
        draggedJambPosition: 3500,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 2450, position: 1775 })
  })

  it('clamps the dragged start jamb to the wall start when dragged past it', () => {
    // Fixed end jamb = 1450; dragging the start jamb to -200 is clamped to the
    // wall start 0, giving width 1450 - 0 = 1450 and center (0 + 1450) / 2 = 725.
    expect(
      computeOpeningResize({
        edge: 'start',
        draggedJambPosition: -200,
        width: OPENING_WIDTH_MM,
        position: OPENING_POSITION_MM,
        wallLength: WALL_LENGTH_MM,
        minWidth: MIN_OPENING_WIDTH_MM,
      }),
    ).toEqual({ width: 1450, position: 725 })
  })
})

// How close to a wall end a jamb must be before it snaps onto the end.
const SNAP_TOLERANCE_MM = 50

describe('snapJambToWallEnd', () => {
  it('snaps to 0 when the jamb is within tolerance of the wall start', () => {
    // 30 is within 50 mm of 0.
    expect(snapJambToWallEnd(30, WALL_LENGTH_MM, SNAP_TOLERANCE_MM)).toBe(0)
  })

  it('snaps to the wall length when the jamb is within tolerance of the wall end', () => {
    // 2980 is within 50 mm of 3000.
    expect(snapJambToWallEnd(2980, WALL_LENGTH_MM, SNAP_TOLERANCE_MM)).toBe(WALL_LENGTH_MM)
  })

  it('leaves the jamb unchanged when it is far from both wall ends', () => {
    // 1500 is more than 50 mm from both 0 and 3000.
    expect(snapJambToWallEnd(1500, WALL_LENGTH_MM, SNAP_TOLERANCE_MM)).toBe(1500)
  })
})
