import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { componentCount, nonFiniteNumberPaths } from './derivation-property-checks-test-support'
import { ALL_HARD_CASES, PROPERTY_RUNS, planArbitrary } from './plan-arbitraries-test-support'
import { deriveRooms } from './rooms'
import { buildWallGraph } from './wall-graph'

describe('the derivation on any generated plan', () => {
  it('returns a graph and rooms whose numbers are all finite, with every hard case', () => {
    fc.assert(
      fc.property(planArbitrary({ hardCases: ALL_HARD_CASES, mixThicknesses: true }), (plan) => {
        const graph = buildWallGraph(plan.walls)
        const rooms = deriveRooms(plan.walls)

        expect(nonFiniteNumberPaths(graph, 'graph')).toEqual([])
        expect(nonFiniteNumberPaths(rooms, 'rooms')).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})

describe('the room count of any generated plan', () => {
  it('derives as many rooms as edges minus vertices plus components', () => {
    fc.assert(
      fc.property(planArbitrary(), (plan) => {
        const graph = buildWallGraph(plan.walls)
        const expectedRooms = graph.edges.length - graph.vertices.length + componentCount(graph)

        expect(deriveRooms(plan.walls)).toHaveLength(expectedRooms)
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('gives every room polygon at least three corners', () => {
    fc.assert(
      fc.property(planArbitrary(), (plan) => {
        const degenerateRooms = deriveRooms(plan.walls).filter((room) => room.polygon.length < 3)

        expect(degenerateRooms).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
