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

  it('splits a wall edge where another wall ends on its interior (T-junction)', () => {
    const base = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })
    const partition = createWall({ x: 2000, y: 0 }, { x: 2000, y: 3000 })

    const graph = buildWallGraph([base, partition])

    expect(graph.vertices).toHaveLength(4)
    expect(graph.edges).toHaveLength(3)

    const junction = graph.vertices.findIndex((vertex) => vertex.x === 2000 && vertex.y === 0)
    expect(junction).toBeGreaterThanOrEqual(0)

    const incidentToJunction = graph.edges.filter(
      (edge) => edge.a === junction || edge.b === junction,
    )
    expect(incidentToJunction).toHaveLength(3)
  })

  it('drops a zero-length wall, producing no edges', () => {
    const graph = buildWallGraph([createWall({ x: 0, y: 0 }, { x: 0, y: 0 })])

    expect(graph.edges).toHaveLength(0)
  })
})
