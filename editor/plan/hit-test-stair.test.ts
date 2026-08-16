import { describe, it, expect } from 'vitest'
import { hitTestStairs, stairBounds } from './hit-test-stair'
import type { Point, StairSceneNode } from '../../core'

// A straight run 1000 mm across by 3000 mm long, anchored at its position and
// unrotated, so the footprint spans x 0..1000 and y 0..3000.
const STAIR_WIDTH_MM = 1000
const STAIR_LENGTH_MM = 3000

// A quarter turn counter-clockwise about the stair position, which swings the
// run onto the -x side: x spans -3000..0 and y spans 0..1000.
const QUARTER_TURN = Math.PI / 2

function stair(id: string, rotation = 0): StairSceneNode {
  return {
    id,
    kind: 'stair',
    floorId: 'f1',
    wellFloorId: 'f2',
    runType: 'straight',
    position: { x: 0, y: 0 },
    width: STAIR_WIDTH_MM,
    length: STAIR_LENGTH_MM,
    rotation,
  }
}

describe('hitTestStairs', () => {
  it("returns the stair's id when the point lies inside its footprint", () => {
    const point: Point = { x: 500, y: 1500 }

    expect(hitTestStairs([stair('stair:s1')], point)).toBe('stair:s1')
  })

  it('returns null when the point lies outside every footprint', () => {
    // x = 1500 is past the 1000 mm run width.
    const point: Point = { x: 1500, y: 1500 }

    expect(hitTestStairs([stair('stair:s1')], point)).toBeNull()
  })

  it('returns the topmost (later-drawn) stair when footprints overlap', () => {
    const stacked = [stair('stair:s1'), stair('stair:s2')]

    expect(hitTestStairs(stacked, { x: 500, y: 1500 })).toBe('stair:s2')
  })

  it('tests against the rotated footprint, swinging the run onto the -x side', () => {
    const turned = [stair('stair:s1', QUARTER_TURN)]

    expect(hitTestStairs(turned, { x: -1500, y: 500 })).toBe('stair:s1')
    expect(hitTestStairs(turned, { x: 500, y: 1500 })).toBeNull()
  })

  it('returns null for an empty stair list', () => {
    expect(hitTestStairs([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('stairBounds', () => {
  it('spans the footprint of an unrotated run', () => {
    expect(stairBounds(stair('stair:s1'))).toEqual({
      min: { x: 0, y: 0 },
      max: { x: STAIR_WIDTH_MM, y: STAIR_LENGTH_MM },
    })
  })

  // Compared per component rather than deeply: a quarter turn runs through
  // Math.cos, so the corners land a rounding step off the exact axis values.
  it('spans the swept extent of a rotated run', () => {
    const bounds = stairBounds(stair('stair:s1', QUARTER_TURN))

    expect(bounds.min.x).toBeCloseTo(-STAIR_LENGTH_MM)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.x).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(STAIR_WIDTH_MM)
  })
})
