import { describe, expect, it } from 'vitest'
import type { Point } from '../../core'
import type { Bounds } from './fit'
import { labelBox, labelsOverlap } from './label-layout'

function bounds(minX: number, minY: number, maxX: number, maxY: number): Bounds {
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}

// A fixed sans-serif size matching the canvas label paint path. Width is
// estimated from a pure average-glyph-advance model at this size, never from a
// canvas measureText, so placement decisions stay deterministic.
const LABEL_FONT = { sizePx: 12 }

// Center/middle alignment: the returned axis-aligned rect is centered on the
// screen anchor. Allow a sub-pixel tolerance so the contract does not pin an
// exact glyph-advance constant.
const CENTER_TOLERANCE_PX = 0.5

function centerOf(box: { min: Point; max: Point }): Point {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
  }
}

function widthOf(box: { min: Point; max: Point }): number {
  return box.max.x - box.min.x
}

describe('labelBox', () => {
  it('returns an axis-aligned rect centered on the screen anchor', () => {
    const anchor: Point = { x: 320, y: 240 }

    const box = labelBox('Parlor', anchor, LABEL_FONT)

    const center = centerOf(box)
    expect(center.x).toBeCloseTo(anchor.x, CENTER_TOLERANCE_PX)
    expect(center.y).toBeCloseTo(anchor.y, CENTER_TOLERANCE_PX)
  })

  it('grows the box width monotonically with character count', () => {
    const anchor: Point = { x: 0, y: 0 }

    const shortBox = labelBox('WC', anchor, LABEL_FONT)
    const longBox = labelBox('Master Bedroom', anchor, LABEL_FONT)

    expect(widthOf(longBox)).toBeGreaterThan(widthOf(shortBox))
  })

  it('estimates width deterministically from text and font alone', () => {
    const anchor: Point = { x: 17, y: 42 }

    const first = labelBox('Kitchen', anchor, LABEL_FONT)
    const second = labelBox('Kitchen', anchor, LABEL_FONT)

    expect(second).toEqual(first)
  })
})

describe('labelsOverlap', () => {
  it('reports overlap for two boxes that share screen area', () => {
    const a = bounds(0, 0, 10, 10)
    const b = bounds(5, 5, 15, 15)

    expect(labelsOverlap(a, b)).toBe(true)
  })

  it('reports no overlap for two clearly separated boxes', () => {
    const a = bounds(0, 0, 10, 10)
    const b = bounds(100, 100, 110, 110)

    expect(labelsOverlap(a, b)).toBe(false)
  })

  it('does not count boxes that touch only along a shared edge as overlapping', () => {
    // Edge-touch policy: overlap requires a positive-area intersection, so two
    // rects abutting along a single boundary line (zero-area contact) are not
    // considered overlapping.
    const a = bounds(0, 0, 10, 10)
    const b = bounds(10, 0, 20, 10)

    expect(labelsOverlap(a, b)).toBe(false)
  })
})
