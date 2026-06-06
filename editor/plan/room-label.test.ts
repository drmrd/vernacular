import { describe, expect, it } from 'vitest'
import type { Point, RoomSceneNode } from '../../core'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import { roomLabelContent } from './room-label'

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
