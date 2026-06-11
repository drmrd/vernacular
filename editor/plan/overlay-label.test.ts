import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  distance,
  formatLength,
  lengthFormatOptions,
} from '../../core'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  Point,
  RoomSceneNode,
  WallSceneNode,
} from '../../core'
import type { SelectableSceneNode } from './overlay-anchor'
import { ariaLabel } from './overlay-label'

const WALL_THICKNESS_MM = 114
const WALL_START: Point = { x: 0, y: 0 }
const WALL_END: Point = { x: 3000, y: 0 }
const ROOM_AREA_SQ_MM = 12_000_000
const OPENING_WIDTH_MM = 900
const OPENING_HEIGHT_MM = 2040
const SILL_HEIGHT_MM = 0
const DIMENSION_LENGTH_MM = 2500

function wall(start: Point, end: Point): WallSceneNode {
  return { id: 'wall:w1', kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

function room(area: number, name?: string): RoomSceneNode {
  const polygon: Point[] = [{ x: 0, y: 0 }]
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: 'g',
    polygon,
    clearPolygon: polygon,
    area,
    ...(name !== undefined && { name }),
  }
}

function opening(type: string, width: number): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: 'g',
    type,
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width,
    height: OPENING_HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(length: number): DimensionSceneNode {
  return {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: length, y: 0 },
    offset: 0,
    length,
  }
}

describe('ariaLabel', () => {
  it('labels a wall with its metric length', () => {
    const node: SelectableSceneNode = wall(WALL_START, WALL_END)
    expect(ariaLabel(node, DEFAULT_METRIC_PREFERENCES)).toBe('Wall, 3.00 m')
  })

  it('labels a named room with its metric area in square meters', () => {
    const node: SelectableSceneNode = room(ROOM_AREA_SQ_MM, 'Kitchen')
    expect(ariaLabel(node, DEFAULT_METRIC_PREFERENCES)).toBe('Room Kitchen, 12 m²')
  })

  it('labels an unnamed room without a name segment', () => {
    const node: SelectableSceneNode = room(ROOM_AREA_SQ_MM)
    expect(ariaLabel(node, DEFAULT_METRIC_PREFERENCES)).toBe('Room, 12 m²')
  })

  it('labels an opening with a title-cased type and its width', () => {
    const node: SelectableSceneNode = opening('single-swing-door', OPENING_WIDTH_MM)
    expect(ariaLabel(node, DEFAULT_METRIC_PREFERENCES)).toBe('Single Swing Door, 90.0 cm wide')
  })

  it('labels a dimension with its metric length', () => {
    const node: SelectableSceneNode = dimension(DIMENSION_LENGTH_MM)
    expect(ariaLabel(node, DEFAULT_METRIC_PREFERENCES)).toBe('Dimension, 2.50 m')
  })

  it('re-formats the wall measurement under imperial preferences', () => {
    const node: SelectableSceneNode = wall(WALL_START, WALL_END)
    const imperialLength = formatLength(
      distance(WALL_START, WALL_END),
      lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES),
    )
    const imperialLabel = ariaLabel(node, DEFAULT_IMPERIAL_PREFERENCES)
    expect(imperialLabel).toBe(`Wall, ${imperialLength}`)
    expect(imperialLabel).not.toBe(ariaLabel(node, DEFAULT_METRIC_PREFERENCES))
  })

  it('re-formats the dimension measurement under imperial preferences', () => {
    const node: SelectableSceneNode = dimension(DIMENSION_LENGTH_MM)
    const imperialLength = formatLength(
      DIMENSION_LENGTH_MM,
      lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES),
    )
    const imperialLabel = ariaLabel(node, DEFAULT_IMPERIAL_PREFERENCES)
    expect(imperialLabel).toBe(`Dimension, ${imperialLength}`)
    expect(imperialLabel).not.toBe(ariaLabel(node, DEFAULT_METRIC_PREFERENCES))
  })
})
