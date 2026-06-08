import { describe, it, expect } from 'vitest'
import { hitTest, hitTestWalls, roomBounds, wallBounds, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import type { RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: 114 }
}

describe('hitTestWalls', () => {
  it('returns the id of a wall the point lies on', () => {
    const walls = [wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })]

    expect(hitTestWalls(walls, { x: 500, y: 0 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:a')
  })

  it('returns null when the point is beyond the tolerance', () => {
    const walls = [wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })]

    expect(hitTestWalls(walls, { x: 500, y: 5000 }, DEFAULT_HIT_TOLERANCE_MM)).toBeNull()
  })

  it('returns the nearest wall when several are in range', () => {
    const walls = [
      wall('wall:far', { x: 0, y: 100 }, { x: 1000, y: 100 }),
      wall('wall:near', { x: 0, y: 0 }, { x: 1000, y: 0 }),
    ]

    expect(hitTestWalls(walls, { x: 500, y: 10 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:near')
  })

  it('clamps the projection to the segment endpoints', () => {
    const walls = [wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })]

    // A point well past the segment end, but near the endpoint, is within tolerance;
    // a point past the end and far away is not.
    expect(hitTestWalls(walls, { x: 1050, y: 0 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:a')
    expect(hitTestWalls(walls, { x: 5000, y: 0 }, DEFAULT_HIT_TOLERANCE_MM)).toBeNull()
  })
})

describe('wallBounds', () => {
  it('spans the wall endpoints regardless of draw direction', () => {
    const rightToLeftBottomToTop = wall('wall:a', { x: 1000, y: 3000 }, { x: 200, y: 500 })

    expect(wallBounds(rightToLeftBottomToTop)).toEqual({
      min: { x: 200, y: 500 },
      max: { x: 1000, y: 3000 },
    })
  })
})

function room(id: string, polygon: { x: number; y: number }[]): RoomSceneNode {
  return { id, kind: 'room', floorId: 'g', polygon, area: 0 }
}

describe('roomBounds', () => {
  it('spans every vertex of the room polygon', () => {
    const lShape = room('room:a', [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 5000 },
      { x: 0, y: 5000 },
    ])

    expect(roomBounds(lShape)).toEqual({ min: { x: 0, y: 0 }, max: { x: 4000, y: 5000 } })
  })
})

function scene(walls: WallSceneNode[], rooms: RoomSceneNode[] = []): SceneGraph {
  return { nodes: [], walls, rooms, underlays: [], openings: [] }
}

describe('hitTest', () => {
  it('returns the nearest wall within tolerance', () => {
    const graph = scene([
      wall('wall:far', { x: 0, y: 100 }, { x: 1000, y: 100 }),
      wall('wall:near', { x: 0, y: 0 }, { x: 1000, y: 0 }),
    ])

    expect(hitTest(graph, { x: 500, y: 10 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:near')
  })

  const wallAndRoomScene = (): SceneGraph =>
    scene(
      [wall('wall:edge', { x: 0, y: 0 }, { x: 4000, y: 0 })],
      [
        room('room:a', [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 4000 },
          { x: 0, y: 4000 },
        ]),
      ],
    )

  it('falls back to the room whose polygon contains the point when no wall is in range', () => {
    expect(hitTest(wallAndRoomScene(), { x: 2000, y: 2000 }, DEFAULT_HIT_TOLERANCE_MM)).toBe(
      'room:a',
    )
  })

  it('prefers a wall in range over a containing room', () => {
    expect(hitTest(wallAndRoomScene(), { x: 2000, y: 50 }, DEFAULT_HIT_TOLERANCE_MM)).toBe(
      'wall:edge',
    )
  })

  it('returns null when the point hits neither a wall nor a room', () => {
    expect(
      hitTest(wallAndRoomScene(), { x: 50_000, y: 50_000 }, DEFAULT_HIT_TOLERANCE_MM),
    ).toBeNull()
  })
})
