import { describe, expect, it } from 'vitest'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  WallSceneNode,
} from '../../core'
import { selectedEntityIds, selectionGhostSegments } from './selection-entities'

const WALL_THICKNESS_MM = 114

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

function dimension(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): DimensionSceneNode {
  return { id, kind: 'dimension', floorId: 'g', start, end, offset: 0, length: 0 }
}

function room(id: string, polygon: { x: number; y: number }[]): RoomSceneNode {
  return { id, kind: 'room', floorId: 'g', polygon, area: 0, clearPolygon: polygon }
}

interface SceneExtras {
  rooms?: RoomSceneNode[]
  openings?: OpeningSceneNode[]
  dimensions?: DimensionSceneNode[]
}

function scene(walls: WallSceneNode[], extras: SceneExtras = {}): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms: extras.rooms ?? [],
    underlays: [],
    openings: extras.openings ?? [],
    dimensions: extras.dimensions ?? [],
  }
}

describe('selectedEntityIds', () => {
  it('strips the wall, dimension, and opening node prefixes and drops rooms and underlays', () => {
    expect(
      selectedEntityIds(['wall:w1', 'dimension:d1', 'opening:o1', 'room:r1', 'underlay:u1']),
    ).toEqual(['w1', 'd1', 'o1'])
  })

  it('returns an empty array for an empty selection', () => {
    expect(selectedEntityIds([])).toEqual([])
  })
})

describe('selectionGhostSegments', () => {
  const wallStart = { x: 0, y: 0 }
  const wallEnd = { x: 1000, y: 0 }
  const dimensionStart = { x: 0, y: 2000 }
  const dimensionEnd = { x: 4000, y: 2000 }

  const graph = (): SceneGraph =>
    scene([wall('wall:w1', wallStart, wallEnd)], {
      rooms: [
        room('room:r1', [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 4000 },
          { x: 0, y: 4000 },
        ]),
      ],
      dimensions: [dimension('dimension:d1', dimensionStart, dimensionEnd)],
    })

  it('returns the world segments of the selected wall and dimension nodes', () => {
    expect(selectionGhostSegments(graph(), new Set(['wall:w1', 'dimension:d1']))).toEqual([
      { start: wallStart, end: wallEnd },
      { start: dimensionStart, end: dimensionEnd },
    ])
  })

  it('contributes no segment for a selected room or an id absent from the graph', () => {
    expect(selectionGhostSegments(graph(), new Set(['room:r1', 'wall:missing']))).toEqual([])
  })

  it('returns an empty array for an empty selection', () => {
    expect(selectionGhostSegments(graph(), new Set())).toEqual([])
  })
})
