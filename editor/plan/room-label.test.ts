import { describe, expect, it } from 'vitest'
import type { Point, RoomSceneNode } from '../../core'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import { roomLabelContent, roomLabelPlacement } from './room-label'
import type { Viewport } from './viewport'

// A 4 m by 3 m rectangle. Its vertices average to (2000, 1500), the centroid
// the label is anchored to.
const RECTANGLE_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
]
const EXPECTED_CENTROID: Point = { x: 2000, y: 1500 }

// 20 square meters in square millimeters. Under metric preferences formatArea
// renders this as the clean string below, independent of importing formatArea.
const TWENTY_SQUARE_METERS_IN_MM2 = 20_000_000
const EXPECTED_METRIC_AREA = '20 m²'

function rectangularRoom(overrides: Partial<RoomSceneNode> = {}): RoomSceneNode {
  return {
    id: 'room-1',
    kind: 'room',
    floorId: 'floor-1',
    polygon: RECTANGLE_POLYGON,
    clearPolygon: RECTANGLE_POLYGON,
    area: TWENTY_SQUARE_METERS_IN_MM2,
    ...overrides,
  }
}

describe('roomLabelContent', () => {
  it('uses the room name, formatted area, and centroid anchor for a named room', () => {
    const content = roomLabelContent(rectangularRoom({ name: 'Parlor' }), {
      preferences: DEFAULT_METRIC_PREFERENCES,
    })

    expect(content.name).toBe('Parlor')
    expect(content.area).toBe(EXPECTED_METRIC_AREA)
    expect(content.anchor).toEqual(EXPECTED_CENTROID)
  })

  it('leaves the name undefined for an unnamed room but still reports area and anchor', () => {
    const content = roomLabelContent(rectangularRoom(), {
      preferences: DEFAULT_METRIC_PREFERENCES,
    })

    expect(content.name).toBeUndefined()
    expect(content.area).toBe(EXPECTED_METRIC_AREA)
    expect(content.anchor).toEqual(EXPECTED_CENTROID)
  })

  it('anchors the label at the average of the polygon vertices', () => {
    const content = roomLabelContent(rectangularRoom(), {
      preferences: DEFAULT_METRIC_PREFERENCES,
    })

    expect(content.anchor).toEqual(EXPECTED_CENTROID)
  })
})

// A 200 mm by 200 mm room: a closet-scale footprint. At a moderate zoom its
// on-screen extent is only a handful of pixels across, far too small to seat
// even the room name, let alone the name plus the area line below it.
const TINY_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 200 },
  { x: 0, y: 200 },
]
const ONE_QUARTER_SQUARE_METER_IN_MM2 = 250_000

function tinyRoom(overrides: Partial<RoomSceneNode> = {}): RoomSceneNode {
  return {
    id: 'closet-1',
    kind: 'room',
    floorId: 'floor-1',
    polygon: TINY_POLYGON,
    clearPolygon: TINY_POLYGON,
    area: ONE_QUARTER_SQUARE_METER_IN_MM2,
    ...overrides,
  }
}

// A scale (pixels per millimeter) where the 4 m by 3 m room projects to a
// 320 px by 240 px footprint, comfortably larger than its name plus area block,
// while the 200 mm closet projects to just 16 px across.
const PLACEMENT_VIEWPORT: Viewport = { scale: 0.08 }

describe('roomLabelPlacement', () => {
  it('shows the full name and area block for a room with ample on-screen footprint', () => {
    const placement = roomLabelPlacement(rectangularRoom({ name: 'Parlor' }), PLACEMENT_VIEWPORT, {
      preferences: DEFAULT_METRIC_PREFERENCES,
    })

    expect(placement.kind).toBe('full')
    expect(placement.showName).toBe(true)
    expect(placement.showArea).toBe(true)
  })

  it('suppresses the area line or hides the label when the room is too small at this zoom', () => {
    const placement = roomLabelPlacement(tinyRoom({ name: 'Closet' }), PLACEMENT_VIEWPORT, {
      preferences: DEFAULT_METRIC_PREFERENCES,
    })

    expect(placement.kind === 'name-only' || placement.kind === 'hidden').toBe(true)
    expect(placement.showArea).toBe(false)
  })
})
