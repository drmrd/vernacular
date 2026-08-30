import { describe, expect, it } from 'vitest'
import { entitiesCrossingRect, entitiesInRect } from './marquee'
import type { Bounds } from './fit'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  WallSceneNode,
} from '../../core'

const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 800

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

function room(id: string, polygon: { x: number; y: number }[]): RoomSceneNode {
  return { id, kind: 'room', floorId: 'g', polygon, area: 0, clearPolygon: polygon }
}

function opening(id: string, center: { x: number; y: number }): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: 'g',
    type: 'single-swing-door',
    center,
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: 2032,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): DimensionSceneNode {
  return { id, kind: 'dimension', floorId: 'g', start, end, offset: 0, length: 0 }
}

interface SceneExtras {
  openings?: OpeningSceneNode[]
  dimensions?: DimensionSceneNode[]
}

function scene(
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  extras: SceneExtras = {},
): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms,
    underlays: [],
    openings: extras.openings ?? [],
    dimensions: extras.dimensions ?? [],
    stairs: [],
    furniture: [],
  }
}

const rect: Bounds = { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } }

describe('entitiesInRect', () => {
  it('returns walls and rooms fully contained and excludes partial overlaps', () => {
    const graph = scene(
      [
        wall('wall:inside', { x: 100, y: 100 }, { x: 900, y: 900 }),
        wall('wall:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 }),
      ],
      [
        room('room:inside', [
          { x: 100, y: 100 },
          { x: 900, y: 100 },
          { x: 900, y: 900 },
          { x: 100, y: 900 },
        ]),
        room('room:straddling', [
          { x: 100, y: 100 },
          { x: 1500, y: 100 },
          { x: 1500, y: 900 },
          { x: 100, y: 900 },
        ]),
      ],
    )

    expect(new Set(entitiesInRect(graph, rect))).toEqual(new Set(['wall:inside', 'room:inside']))
  })

  it('counts an entity touching the rectangle edge as contained', () => {
    const graph = scene([wall('wall:onEdge', { x: 0, y: 0 }, { x: 1000, y: 1000 })], [])

    expect(entitiesInRect(graph, rect)).toEqual(['wall:onEdge'])
  })

  it('includes an opening whose footprint lies fully inside and excludes a partial one', () => {
    const graph = scene([], [], {
      openings: [
        opening('opening:inside', { x: 500, y: 500 }),
        opening('opening:straddling', { x: 800, y: 500 }),
      ],
    })

    expect(entitiesInRect(graph, rect)).toEqual(['opening:inside'])
  })

  it('includes a dimension whose both endpoints lie inside and excludes a partial one', () => {
    const graph = scene([], [], {
      dimensions: [
        dimension('dimension:inside', { x: 100, y: 100 }, { x: 900, y: 900 }),
        dimension('dimension:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 }),
      ],
    })

    expect(entitiesInRect(graph, rect)).toEqual(['dimension:inside'])
  })

  it('excludes dimensions from the window result when the overlay is hidden, while keeping walls, rooms, and openings', () => {
    const graph = scene(
      [wall('wall:inside', { x: 100, y: 100 }, { x: 900, y: 900 })],
      [
        room('room:inside', [
          { x: 100, y: 100 },
          { x: 900, y: 100 },
          { x: 900, y: 900 },
          { x: 100, y: 900 },
        ]),
      ],
      {
        openings: [opening('opening:inside', { x: 500, y: 500 })],
        dimensions: [dimension('dimension:inside', { x: 100, y: 100 }, { x: 900, y: 900 })],
      },
    )

    expect(new Set(entitiesInRect(graph, rect, { dimensionsVisible: false }))).toEqual(
      new Set(['wall:inside', 'room:inside', 'opening:inside']),
    )
  })
})

describe('entitiesCrossingRect', () => {
  it('includes walls and rooms that merely overlap and excludes ones fully outside', () => {
    const graph = scene(
      [
        wall('wall:inside', { x: 100, y: 100 }, { x: 900, y: 900 }),
        wall('wall:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 }),
        wall('wall:outside', { x: 2000, y: 2000 }, { x: 3000, y: 3000 }),
      ],
      [
        room('room:overlapping', [
          { x: 500, y: 500 },
          { x: 1500, y: 500 },
          { x: 1500, y: 1500 },
          { x: 500, y: 1500 },
        ]),
        room('room:outside', [
          { x: 2000, y: 2000 },
          { x: 3000, y: 2000 },
          { x: 3000, y: 3000 },
          { x: 2000, y: 3000 },
        ]),
      ],
    )

    expect(new Set(entitiesCrossingRect(graph, rect))).toEqual(
      new Set(['wall:inside', 'wall:straddling', 'room:overlapping']),
    )
  })

  it('includes a room that fully encloses the rectangle', () => {
    const graph = scene(
      [],
      [
        room('room:enclosing', [
          { x: -500, y: -500 },
          { x: 2000, y: -500 },
          { x: 2000, y: 2000 },
          { x: -500, y: 2000 },
        ]),
      ],
    )

    expect(entitiesCrossingRect(graph, rect)).toEqual(['room:enclosing'])
  })

  it('includes openings and dimensions that straddle the rectangle edge', () => {
    const graph = scene([], [], {
      openings: [opening('opening:straddling', { x: 950, y: 500 })],
      dimensions: [dimension('dimension:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 })],
    })

    expect(new Set(entitiesCrossingRect(graph, rect))).toEqual(
      new Set(['opening:straddling', 'dimension:straddling']),
    )
  })

  it('excludes dimensions from the crossing result when the overlay is hidden, while keeping walls, rooms, and openings', () => {
    const graph = scene(
      [wall('wall:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 })],
      [
        room('room:overlapping', [
          { x: 500, y: 500 },
          { x: 1500, y: 500 },
          { x: 1500, y: 1500 },
          { x: 500, y: 1500 },
        ]),
      ],
      {
        openings: [opening('opening:straddling', { x: 950, y: 500 })],
        dimensions: [dimension('dimension:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 })],
      },
    )

    expect(new Set(entitiesCrossingRect(graph, rect, { dimensionsVisible: false }))).toEqual(
      new Set(['wall:straddling', 'room:overlapping', 'opening:straddling']),
    )
  })
})
