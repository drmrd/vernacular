import { describe, expect, it } from 'vitest'
import { createWall } from '../model/factories'
import { buildWallGraph } from './wall-graph'

describe('buildWallGraph', () => {
  it('merges coincident endpoints of a closed rectangle into shared vertices', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]

    const graph = buildWallGraph(walls)

    expect(graph.vertices).toHaveLength(4)
    expect(graph.edges).toHaveLength(4)
    for (const edge of graph.edges) {
      expect(edge.a).not.toBe(edge.b)
      expect(typeof edge.wallId).toBe('string')
    }
  })

  it('drops a zero-length wall, producing no edges', () => {
    const graph = buildWallGraph([createWall({ x: 0, y: 0 }, { x: 0, y: 0 })])

    expect(graph.edges).toHaveLength(0)
  })
})
