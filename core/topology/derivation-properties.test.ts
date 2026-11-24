import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import {
  componentCount,
  nonFiniteNumberPaths,
  roomSignature,
  signatureDifferences,
} from './derivation-property-checks-test-support'
import {
  ALL_HARD_CASES,
  PROPERTY_RUNS,
  closedLoopArbitrary,
  planArbitrary,
} from './plan-arbitraries-test-support'
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

const AREA_RELATIVE_TOLERANCE = 1e-6
const MOVE_EXTENT_MM = 20_000
const MAX_CORNERS = 8

function moveEnds(walls: readonly Wall[], change: (point: Point) => Point): Wall[] {
  return walls.map((wall) => ({ ...wall, start: change(wall.start), end: change(wall.end) }))
}

/** Asserts that the transformed walls derive the same wall id sets, with the same clear areas. */
function expectSameRooms(original: readonly Wall[], transformed: readonly Wall[]): void {
  const differences = signatureDifferences(
    roomSignature(deriveRooms(original)),
    roomSignature(deriveRooms(transformed)),
    AREA_RELATIVE_TOLERANCE,
  )

  expect(differences).toEqual([])
}

describe('the rooms of a closed loop', () => {
  it('do not change when the walls are reordered', () => {
    const keys = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: MAX_CORNERS,
      maxLength: MAX_CORNERS,
    })
    fc.assert(
      fc.property(closedLoopArbitrary(), keys, (plan, keyDraw) => {
        const reordered = plan.walls
          .map((wall, index) => ({ wall, index, key: keyDraw[index] ?? 0 }))
          .sort((x, y) => x.key - y.key || x.index - y.index)
          .map(({ wall }) => wall)

        expectSameRooms(plan.walls, reordered)
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('do not change when the loop is moved by a vector within the extent', () => {
    const component = fc.double({ min: -MOVE_EXTENT_MM, max: MOVE_EXTENT_MM, noNaN: true })
    fc.assert(
      fc.property(closedLoopArbitrary(), component, component, (plan, dx, dy) => {
        const moved = moveEnds(plan.walls, (point) => ({ x: point.x + dx, y: point.y + dy }))

        expectSameRooms(plan.walls, moved)
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('do not change when the loop is turned about the origin by any angle', () => {
    const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true })
    fc.assert(
      fc.property(closedLoopArbitrary(), angle, (plan, theta) => {
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        const turned = moveEnds(plan.walls, (point) => ({
          x: point.x * cos - point.y * sin,
          y: point.x * sin + point.y * cos,
        }))

        expectSameRooms(plan.walls, turned)
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})
