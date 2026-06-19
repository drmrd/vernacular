import { describe, expect, it } from 'vitest'
import type { Point, RoomSceneNode } from '../../core'
import { DEFAULT_METRIC_PREFERENCES, polygonCentroid } from '../../core'
import type { Bounds } from './fit'
import { labelBox, labelsOverlap, layoutRoomLabels } from './label-layout'
import { worldToScreen, type Viewport } from './viewport'

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

const POSITION_TOLERANCE_PX = 0.5

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

// A unit-scale viewport: one world millimeter projects to one screen pixel, so
// the room geometry below maps to easily reasoned screen rects. World y
// increases upward and screen y downward, so the projected anchor's y is
// negated; the assertions read the box back through worldToScreen rather than
// hard-coding the sign.
const UNIT_VIEWPORT: Viewport = { scale: 1 }

// A 4 m by 3 m room. At unit scale its on-screen footprint is 4000 px by
// 3000 px, comfortably large enough that its label is shown rather than hidden,
// so the layout pass must resolve the collision by repositioning, not by
// dropping the label.
function largeRoom(id: string, name: string, originX: number): RoomSceneNode {
  return {
    id,
    kind: 'room',
    floorId: 'floor-1',
    polygon: [
      { x: originX, y: 0 },
      { x: originX + 4000, y: 0 },
      { x: originX + 4000, y: 3000 },
      { x: originX, y: 3000 },
    ],
    clearPolygon: [
      { x: originX, y: 0 },
      { x: originX + 4000, y: 0 },
      { x: originX + 4000, y: 3000 },
      { x: originX, y: 3000 },
    ],
    area: 12_000_000,
    name,
  }
}

const LAYOUT_LABEL_FONT = { sizePx: 12 }

function visibleEntries(layout: ReturnType<typeof layoutRoomLabels>) {
  return layout.filter((entry) => entry.kind !== 'hidden')
}

function entryFor(layout: ReturnType<typeof layoutRoomLabels>, roomId: string) {
  const entry = layout.find((candidate) => candidate.roomId === roomId)
  if (entry === undefined) {
    throw new Error(`no layout entry for room ${roomId}`)
  }
  return entry
}

describe('layoutRoomLabels', () => {
  const layoutOptions = { preferences: DEFAULT_METRIC_PREFERENCES }

  it('de-conflicts two room labels whose raw centroid boxes would overlap', () => {
    // Two rooms 10 px apart at unit scale. At the raw centroids their name
    // boxes ("WC", ~13 px wide) straddle each other, so the unresolved labels
    // collide.
    const first = largeRoom('room-a', 'WC', 0)
    const second = largeRoom('room-b', 'WC', 10)

    const rawFirstBox = labelBox(
      'WC',
      worldToScreen(polygonCentroid(first.polygon), UNIT_VIEWPORT),
      LAYOUT_LABEL_FONT,
    )
    const rawSecondBox = labelBox(
      'WC',
      worldToScreen(polygonCentroid(second.polygon), UNIT_VIEWPORT),
      LAYOUT_LABEL_FONT,
    )
    expect(labelsOverlap(rawFirstBox, rawSecondBox)).toBe(true)

    const layout = layoutRoomLabels([first, second], UNIT_VIEWPORT, layoutOptions)
    const visible = visibleEntries(layout)

    expect(visible).toHaveLength(2)
    expect(labelsOverlap(visible[0]!.box, visible[1]!.box)).toBe(false)
  })

  it('leaves two well-separated room labels at their original positions', () => {
    // 1000 px apart at unit scale: the name boxes are nowhere near each other,
    // so the declutter pass has nothing to resolve and must not move either
    // label. The assertion pins the box center to the projected centroid (no
    // nudge), staying agnostic about the box's exact extent, which the layout
    // module owns.
    const first = largeRoom('room-a', 'WC', 0)
    const second = largeRoom('room-b', 'WC', 1000)

    const firstAnchor = worldToScreen(polygonCentroid(first.polygon), UNIT_VIEWPORT)
    const secondAnchor = worldToScreen(polygonCentroid(second.polygon), UNIT_VIEWPORT)

    const layout = layoutRoomLabels([first, second], UNIT_VIEWPORT, layoutOptions)

    const firstCenter = centerOf(entryFor(layout, 'room-a').box)
    expect(firstCenter.x).toBeCloseTo(firstAnchor.x, POSITION_TOLERANCE_PX)
    expect(firstCenter.y).toBeCloseTo(firstAnchor.y, POSITION_TOLERANCE_PX)

    const secondCenter = centerOf(entryFor(layout, 'room-b').box)
    expect(secondCenter.x).toBeCloseTo(secondAnchor.x, POSITION_TOLERANCE_PX)
    expect(secondCenter.y).toBeCloseTo(secondAnchor.y, POSITION_TOLERANCE_PX)
  })
})
