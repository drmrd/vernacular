import { describe, expect, it } from 'vitest'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  Point,
  RoomSceneNode,
  WallSceneNode,
} from '../../core'
import { entityAnchor } from './overlay-anchor'

const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 900
const OPENING_HEIGHT_MM = 2040
const SILL_HEIGHT_MM = 0

function wall(start: Point, end: Point): WallSceneNode {
  return { id: 'wall:w1', kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

function opening(center: Point): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: 'g',
    type: 'door.single',
    center,
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(start: Point, end: Point, offset: number): DimensionSceneNode {
  return { id: 'dimension:d1', kind: 'dimension', floorId: 'g', start, end, offset, length: 0 }
}

function room(polygon: Point[]): RoomSceneNode {
  return { id: 'room:r1', kind: 'room', floorId: 'g', polygon, clearPolygon: polygon, area: 0 }
}

describe('entityAnchor', () => {
  it('anchors a wall at the midpoint of its endpoints', () => {
    expect(entityAnchor(wall({ x: 0, y: 0 }, { x: 100, y: 0 }))).toEqual({ x: 50, y: 0 })
  })

  it('anchors an opening at its center verbatim', () => {
    expect(entityAnchor(opening({ x: 30, y: 40 }))).toEqual({ x: 30, y: 40 })
  })

  it('anchors a dimension at the midpoint of its offset dimension line', () => {
    expect(entityAnchor(dimension({ x: 0, y: 0 }, { x: 100, y: 0 }, 10))).toEqual({ x: 50, y: 10 })
  })

  it('anchors a room at the centroid of its polygon vertices', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
    ]
    expect(entityAnchor(room(polygon))).toEqual({ x: 20, y: 15 })
  })
})
