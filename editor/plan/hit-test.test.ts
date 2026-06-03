import { describe, it, expect } from 'vitest'
import { hitTestWalls, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import type { WallSceneNode } from '../../core'

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
