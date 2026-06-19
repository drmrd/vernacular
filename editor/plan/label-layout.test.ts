import { describe, expect, it } from 'vitest'
import type { DimensionSceneNode, Point, RoomSceneNode } from '../../core'
import {
  DEFAULT_METRIC_PREFERENCES,
  dimensionGeometry,
  formatAdaptiveLength,
  polygonCentroid,
} from '../../core'
import type { Bounds } from './fit'
import { midpoint } from './geometry'
import { labelBox, labelsOverlap, layoutDimensionLabels, layoutRoomLabels } from './label-layout'
import { worldToScreen, type Viewport } from './viewport'

function bounds(min: Point, max: Point): Bounds {
  return { min: { x: min.x, y: min.y }, max: { x: max.x, y: max.y } }
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
    const a = bounds({ x: 0, y: 0 }, { x: 10, y: 10 })
    const b = bounds({ x: 5, y: 5 }, { x: 15, y: 15 })

    expect(labelsOverlap(a, b)).toBe(true)
  })

  it('reports no overlap for two clearly separated boxes', () => {
    const a = bounds({ x: 0, y: 0 }, { x: 10, y: 10 })
    const b = bounds({ x: 100, y: 100 }, { x: 110, y: 110 })

    expect(labelsOverlap(a, b)).toBe(false)
  })

  it('does not count boxes that touch only along a shared edge as overlapping', () => {
    // Edge-touch policy: overlap requires a positive-area intersection, so two
    // rects abutting along a single boundary line (zero-area contact) are not
    // considered overlapping.
    const a = bounds({ x: 0, y: 0 }, { x: 10, y: 10 })
    const b = bounds({ x: 10, y: 0 }, { x: 20, y: 10 })

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

// A horizontal dimension from (originX, 0) to (originX + length, 0) with the
// given offset, mirroring how the dimension draw path consumes a
// DimensionSceneNode (start/end/offset/length). At unit scale its offset line
// projects to screen y = -offset, and its label sits at the offset-line
// midpoint, matching dimensionChips / drawDimension.
interface HorizontalDimensionSpec {
  id: string
  originX: number
  length: number
  offset: number
}

function horizontalDimension(spec: HorizontalDimensionSpec): DimensionSceneNode {
  const { id, originX, length, offset } = spec
  return {
    id,
    kind: 'dimension',
    floorId: 'floor-1',
    start: { x: originX, y: 0 },
    end: { x: originX + length, y: 0 },
    offset,
    length,
  }
}

// The raw, pre-declutter label box of a dimension: the formatted length text
// placed (center/middle) at the screen midpoint of its offset line, exactly the
// placement the draw path uses today. The layout pass de-conflicts these.
function rawDimensionBox(node: DimensionSceneNode, viewport: Viewport): Bounds {
  const geom = dimensionGeometry(node.start, node.end, node.offset)
  const anchor = worldToScreen(midpoint(geom.lineStart, geom.lineEnd), viewport)
  const text = formatAdaptiveLength(node.length, DEFAULT_METRIC_PREFERENCES)
  return labelBox(text, anchor, LAYOUT_LABEL_FONT)
}

function dimensionEntryFor(layout: ReturnType<typeof layoutDimensionLabels>, dimensionId: string) {
  const entry = layout.find((candidate) => candidate.dimensionId === dimensionId)
  if (entry === undefined) {
    throw new Error(`no layout entry for dimension ${dimensionId}`)
  }
  return entry
}

describe('layoutDimensionLabels', () => {
  const layoutOptions = { preferences: DEFAULT_METRIC_PREFERENCES }

  it('displaces two parallel dimension labels whose midpoint boxes would collide', () => {
    // Two parallel horizontal dimensions over the same x-span (identical length
    // text) whose offset lines sit 5 px apart at unit scale. Their raw midpoint
    // label boxes, both ~12 px tall, straddle each other, so the unresolved
    // labels collide.
    const first = horizontalDimension({ id: 'dim-a', originX: 0, length: 1000, offset: 0 })
    const second = horizontalDimension({ id: 'dim-b', originX: 0, length: 1000, offset: 5 })

    expect(
      labelsOverlap(rawDimensionBox(first, UNIT_VIEWPORT), rawDimensionBox(second, UNIT_VIEWPORT)),
    ).toBe(true)

    const layout = layoutDimensionLabels([first, second], UNIT_VIEWPORT, layoutOptions)

    expect(layout).toHaveLength(2)
    const firstBox = dimensionEntryFor(layout, 'dim-a').box
    const secondBox = dimensionEntryFor(layout, 'dim-b').box
    expect(labelsOverlap(firstBox, secondBox)).toBe(false)
  })

  it('keeps a lone dimension label at its offset-line midpoint', () => {
    // A single dimension has nothing to collide with, so the layout pass must
    // leave its label centered on the projected offset-line midpoint. The
    // assertion pins the box center to that midpoint, staying agnostic about the
    // box's exact extent, which the layout module owns.
    const lone = horizontalDimension({ id: 'dim-a', originX: 0, length: 1000, offset: 0 })

    const geom = dimensionGeometry(lone.start, lone.end, lone.offset)
    const anchor = worldToScreen(midpoint(geom.lineStart, geom.lineEnd), UNIT_VIEWPORT)

    const layout = layoutDimensionLabels([lone], UNIT_VIEWPORT, layoutOptions)

    expect(layout).toHaveLength(1)
    const center = centerOf(dimensionEntryFor(layout, 'dim-a').box)
    expect(center.x).toBeCloseTo(anchor.x, POSITION_TOLERANCE_PX)
    expect(center.y).toBeCloseTo(anchor.y, POSITION_TOLERANCE_PX)
  })
})
