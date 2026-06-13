import { describe, expect, it } from 'vitest'
import { resolveOpeningEdge } from './opening-edge'
import type { GraphEdge, PlanarGraph } from './wall-graph'

interface OpeningInput {
  center: { x: number; y: number }
  hostWallId?: string
}

describe('resolveOpeningEdge', () => {
  it('places an opening on its single host edge at its distance from the a-vertex', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [{ a: 0, b: 1, wallId: 'w1' }],
    }
    const opening: OpeningInput = { center: { x: 1000, y: 0 }, hostWallId: 'w1' }

    const result = resolveOpeningEdge(opening, graph)

    expect(result).not.toBeNull()
    expect(result?.edge).toBe(graph.edges[0])
    expect(result?.positionAlongEdge).toBeCloseTo(1000)
  })

  it('selects the host edge whose span contains the center when the wall is split', () => {
    const firstEdge: GraphEdge = { a: 0, b: 1, wallId: 'w1' }
    const secondEdge: GraphEdge = { a: 1, b: 2, wallId: 'w1' }
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [firstEdge, secondEdge],
    }
    const opening: OpeningInput = { center: { x: 3000, y: 0 }, hostWallId: 'w1' }

    const result = resolveOpeningEdge(opening, graph)

    expect(result).not.toBeNull()
    expect(result?.edge).toBe(secondEdge)
    expect(result?.edge.a).toBe(1)
    expect(result?.edge.b).toBe(2)
    expect(result?.positionAlongEdge).toBeCloseTo(1000)
  })

  it('returns null when the opening has no host wall id', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [{ a: 0, b: 1, wallId: 'w1' }],
    }
    const opening: OpeningInput = { center: { x: 1000, y: 0 } }

    expect(resolveOpeningEdge(opening, graph)).toBeNull()
  })

  it('returns null when no edge carries the opening host wall id', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [{ a: 0, b: 1, wallId: 'w1' }],
    }
    const opening: OpeningInput = { center: { x: 1000, y: 0 }, hostWallId: 'nope' }

    expect(resolveOpeningEdge(opening, graph)).toBeNull()
  })

  it('returns null when the center projects past every matching edge', () => {
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
      ],
      edges: [{ a: 0, b: 1, wallId: 'w1' }],
    }
    // The host wall id matches, but the center sits beyond the edge end (5000 > 4000).
    const opening: OpeningInput = { center: { x: 5000, y: 0 }, hostWallId: 'w1' }

    expect(resolveOpeningEdge(opening, graph)).toBeNull()
  })
})
