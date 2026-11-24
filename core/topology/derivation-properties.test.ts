import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { nonFiniteNumberPaths } from './derivation-property-checks-test-support'
import { ALL_HARD_CASES, PROPERTY_RUNS, planArbitrary } from './plan-arbitraries-test-support'
import { deriveRooms } from './rooms'
import { buildWallGraph } from './wall-graph'

describe('the derivation on any generated plan', () => {
  it('returns a graph and rooms whose numbers are all finite, with every hard case', () => {
    fc.assert(
      fc.property(planArbitrary({ hardCases: ALL_HARD_CASES }), (plan) => {
        const graph = buildWallGraph(plan.walls)
        const rooms = deriveRooms(plan.walls)

        expect(nonFiniteNumberPaths(graph, 'graph')).toEqual([])
        expect(nonFiniteNumberPaths(rooms, 'rooms')).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
