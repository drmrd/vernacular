import { describe, it, expect } from 'vitest'
import { hoverTarget } from './hover-target'
import { hitTest, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import type { OpeningSceneNode, RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'

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

interface SceneExtras {
  openings?: OpeningSceneNode[]
}

function scene(
  walls: WallSceneNode[],
  rooms: RoomSceneNode[] = [],
  extras: SceneExtras = {},
): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms,
    underlays: [],
    openings: extras.openings ?? [],
    dimensions: [],
    stairs: [],
  }
}

const NO_SELECTION: ReadonlySet<string> = new Set<string>()

describe('hoverTarget', () => {
  it('returns the hit-test pick when nothing is selected', () => {
    const graph = scene([wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })])
    const point = { x: 500, y: 0 }

    expect(hoverTarget(graph, point, DEFAULT_HIT_TOLERANCE_MM, NO_SELECTION)).toBe(
      hitTest(graph, point, DEFAULT_HIT_TOLERANCE_MM),
    )
    expect(hoverTarget(graph, point, DEFAULT_HIT_TOLERANCE_MM, NO_SELECTION)).toBe('wall:a')
  })

  it('returns null over empty space where the hit test finds nothing', () => {
    const graph = scene([wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })])

    expect(
      hoverTarget(graph, { x: 500, y: 5000 }, DEFAULT_HIT_TOLERANCE_MM, NO_SELECTION),
    ).toBeNull()
  })

  it('suppresses the highlight when the picked entity is already selected', () => {
    const graph = scene([wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })])
    const point = { x: 500, y: 0 }
    const selected: ReadonlySet<string> = new Set(['wall:a'])

    expect(hoverTarget(graph, point, DEFAULT_HIT_TOLERANCE_MM, selected)).toBeNull()
  })

  it('honors the pick order, returning the opening over the room beneath it', () => {
    const graph = scene(
      [wall('wall:host', { x: 0, y: 0 }, { x: 2000, y: 0 })],
      [
        room('room:a', [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 2000 },
          { x: 0, y: 2000 },
        ]),
      ],
      { openings: [opening('opening:o1', { x: 1000, y: 0 })] },
    )

    expect(hoverTarget(graph, { x: 1000, y: 0 }, DEFAULT_HIT_TOLERANCE_MM, NO_SELECTION)).toBe(
      'opening:o1',
    )
  })
})
