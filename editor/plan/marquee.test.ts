import { describe, expect, it } from 'vitest'
import { entitiesInRect } from './marquee'
import type { Bounds } from './fit'
import type { RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: 114 }
}

function room(id: string, polygon: { x: number; y: number }[]): RoomSceneNode {
  return { id, kind: 'room', floorId: 'g', polygon, area: 0 }
}

function scene(walls: WallSceneNode[], rooms: RoomSceneNode[]): SceneGraph {
  return { nodes: [], walls, rooms, underlays: [], openings: [] }
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
})
