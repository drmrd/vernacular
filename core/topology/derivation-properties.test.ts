import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { distance } from '../geometry/point'
import { DERIVATION_LENGTH_TOLERANCE_MM } from '../geometry/tolerance'
import type { Point, Wall } from '../model/types'
import {
  componentCount,
  directedSegmentsInManyRooms,
  nonFiniteNumberPaths,
  roomSignature,
  signatureDifferences,
  unmatchedRooms,
} from './derivation-property-checks-test-support'
import {
  ALL_HARD_CASES,
  PROPERTY_RUNS,
  closedLoopArbitrary,
  planArbitrary,
  splitWallAt,
} from './plan-arbitraries-test-support'
import { squareLoopWalls } from './plan-geometry-test-support'
import { lerp } from './plan-hard-cases-test-support'
import { deriveRooms } from './rooms'
import { buildWallGraph } from './wall-graph'
import {
  expectSharedCorners,
  meetingWalls,
  wallsAcrossGap,
} from './wall-junction-arbitraries-test-support'

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

  it('lets every edge bound at most one room on each side', () => {
    fc.assert(
      fc.property(planArbitrary(), (plan) => {
        expect(directedSegmentsInManyRooms(deriveRooms(plan.walls))).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })
})

const AREA_RELATIVE_TOLERANCE = 1e-6
const MOVE_EXTENT_MM = 20_000
const MAX_CORNERS = 8
const OUTLINE_TOLERANCE_MM = 1e-6
const THICKNESSES_MM = [100, 114.3, 150, 230, 300, 450]
const MAX_RATIO_OF_CLOSE_THICKNESSES = 1.5

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
  it('keep their bounding walls and clear areas when overdrawn along any wall', () => {
    const squares = fc.integer({ min: 1500, max: 8000 }).map((side) => ({
      walls: squareLoopWalls(0, side, 'square'),
      label: `square side ${side}`,
    }))
    const loops = fc.oneof(squares, closedLoopArbitrary({ allowSharpCorners: true }))
    const spans = fc.oneof(
      fc.constant([0, 1] as const),
      fc
        .integer({ min: 0, max: 99 })
        .chain((start) =>
          fc.integer({ min: start + 1, max: 100 }).map((end) => [start / 100, end / 100] as const),
        ),
    )
    const strokes = fc.record({ choice: fc.nat(), span: spans, reversed: fc.boolean() })

    fc.assert(
      fc.property(loops, strokes, (plan, { choice, span: [from, to], reversed }) => {
        const wall = plan.walls[choice % plan.walls.length]
        if (wall === undefined) throw new Error('expected a wall on the closed loop')

        const first = lerp(wall.start, wall.end, from)
        const second = lerp(wall.start, wall.end, to)
        const overdraw = {
          ...wall,
          id: 'overdraw',
          start: reversed ? second : first,
          end: reversed ? first : second,
        }
        expect(distance(overdraw.start, overdraw.end)).toBeGreaterThan(
          DERIVATION_LENGTH_TOLERANCE_MM,
        )

        const original = roomSignature(deriveRooms(plan.walls))
        const overdrawn = roomSignature(deriveRooms([...plan.walls, overdraw]))
        const boundingWalls = plan.walls
          .map((each) => each.id)
          .sort()
          .join(',')

        expect(original.map((room) => room.walls)).toEqual([boundingWalls])
        expect(original[0]?.area).toBeGreaterThan(0)
        expect(signatureDifferences(original, overdrawn, AREA_RELATIVE_TOLERANCE)).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('do not change when the walls are reordered', () => {
    const keys = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: MAX_CORNERS,
      maxLength: MAX_CORNERS,
    })
    fc.assert(
      fc.property(closedLoopArbitrary({ maxCorners: MAX_CORNERS }), keys, (plan, keyDraw) => {
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

describe('splits, the merge distance, and shared corners', () => {
  it('keep the rooms of a closed loop when any wall is split', () => {
    const fraction = fc.double({ min: 0.05, max: 0.95, noNaN: true })
    fc.assert(
      fc.property(closedLoopArbitrary(), fc.nat(), fraction, (plan, choice, at) => {
        const split = splitWallAt(plan, choice % plan.walls.length, at)
        const rooms = deriveRooms(plan.walls)
        const splitRooms = deriveRooms(split.walls)
        const tolerance = { outlineMm: OUTLINE_TOLERANCE_MM, areaRelative: AREA_RELATIVE_TOLERANCE }

        expect(splitRooms).toHaveLength(rooms.length)
        expect(unmatchedRooms(rooms, splitRooms, tolerance)).toEqual([])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('merge two ends closer than half the tolerance into one vertex', () => {
    const gap = fc.double({
      min: 0,
      max: DERIVATION_LENGTH_TOLERANCE_MM / 2,
      maxExcluded: true,
      noNaN: true,
    })
    fc.assert(
      fc.property(wallsAcrossGap(gap), (walls) => {
        const graph = buildWallGraph(walls)

        expect([graph.vertices.length, graph.edges.length]).toEqual([3, 2])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('keep two ends more than twice the tolerance apart as two vertices', () => {
    const gap = fc.double({
      min: 2 * DERIVATION_LENGTH_TOLERANCE_MM,
      max: 6 * DERIVATION_LENGTH_TOLERANCE_MM,
      minExcluded: true,
      noNaN: true,
    })
    fc.assert(
      fc.property(wallsAcrossGap(gap), (walls) => {
        const graph = buildWallGraph(walls)

        expect([graph.vertices.length, graph.edges.length]).toEqual([4, 2])
      }),
      { numRuns: PROPERTY_RUNS },
    )
  })

  it('give two walls of one thickness the same corners where they meet', () => {
    const thickness = fc.constantFrom(...THICKNESSES_MM).map((value) => [value, value])
    fc.assert(fc.property(meetingWalls({ min: 35, max: 179 }, thickness), expectSharedCorners), {
      numRuns: PROPERTY_RUNS,
    })
  })

  it('give two walls of close thicknesses the same corners where they meet', () => {
    const closePair = fc
      .constantFrom(...THICKNESSES_MM)
      .chain((first) =>
        fc
          .constantFrom(
            ...THICKNESSES_MM.filter(
              (other) =>
                Math.max(first, other) / Math.min(first, other) <= MAX_RATIO_OF_CLOSE_THICKNESSES,
            ),
          )
          .map((second) => [first, second]),
      )
    fc.assert(fc.property(meetingWalls({ min: 45, max: 170 }, closePair), expectSharedCorners), {
      numRuns: PROPERTY_RUNS,
    })
  })
})
