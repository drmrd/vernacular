import { describe, expect, it } from 'vitest'

import type { WallSceneNode } from '../../core'

import { buildFloorWallGraph } from './wall-scene-helpers'

const THICKNESS = 114

function wallNode(
  id: string,
  start: WallSceneNode['start'],
  end: WallSceneNode['end'],
): WallSceneNode {
  return { id: `wall:${id}`, kind: 'wall', floorId: 'floor:1', start, end, thickness: THICKNESS }
}

describe('buildFloorWallGraph', () => {
  it('builds the floor wall graph keyed by the model wall ids', () => {
    const graph = buildFloorWallGraph([
      wallNode('a', { x: 0, y: 0 }, { x: 1000, y: 0 }),
      wallNode('b', { x: 1000, y: 0 }, { x: 1000, y: 800 }),
    ])

    expect(graph).toEqual({
      vertices: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 800 },
      ],
      edges: [
        { a: 0, b: 1, wallId: 'a' },
        { a: 1, b: 2, wallId: 'b' },
      ],
    })
  })
})
