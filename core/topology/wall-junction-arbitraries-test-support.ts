import fc from 'fast-check'
import { expect } from 'vitest'
import { distance } from '../geometry/point'
import { DERIVATION_LENGTH_TOLERANCE_MM } from '../geometry/tolerance'
import type { Point, Wall } from '../model/types'
import { cornersAtVertex } from './derivation-property-checks-test-support'
import { wallFootprints } from './wall-footprint'
import { buildWallGraph } from './wall-graph'

const PLAN_EXTENT_MM = 20_000
const MAX_DIRECTION_OFFSET_RAD = 1.5
const DEGREES_PER_HALF_TURN = 180

const anyPoint = fc.record({
  x: fc.double({ min: -PLAN_EXTENT_MM, max: PLAN_EXTENT_MM, noNaN: true }),
  y: fc.double({ min: -PLAN_EXTENT_MM, max: PLAN_EXTENT_MM, noNaN: true }),
})
const heading = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true })

function wallBetween(id: string, start: Point, end: Point): Wall {
  return { id, start, end, thickness: 100 }
}

function towards(from: Point, angle: number, length: number): Point {
  return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) }
}

/** Wall A ends at p; wall B starts `gap` along the direction u from p; both lie away from the gap. */
export function wallsAcrossGap(gap: fc.Arbitrary<number>): fc.Arbitrary<Wall[]> {
  const length = fc.double({ min: 500, max: 5000, noNaN: true })
  const offset = fc.double({
    min: -MAX_DIRECTION_OFFSET_RAD,
    max: MAX_DIRECTION_OFFSET_RAD,
    noNaN: true,
  })
  return fc
    .record({
      p: anyPoint,
      u: heading,
      gap,
      lengthA: length,
      lengthB: length,
      a: offset,
      b: offset,
    })
    .map(({ p, u, gap: d, lengthA, lengthB, a, b }) => {
      const q = towards(p, u, d)
      return [
        wallBetween('a', towards(p, u + a + Math.PI, lengthA), p),
        wallBetween('b', q, towards(q, u + b, lengthB)),
      ]
    })
}

export interface MeetingWalls {
  readonly walls: Wall[]
  readonly thicknesses: number[]
  readonly junction: Point
}

export function meetingWalls(
  degrees: { min: number; max: number },
  thicknesses: fc.Arbitrary<number[]>,
): fc.Arbitrary<MeetingWalls> {
  const length = fc.double({ min: 1000, max: 5000, noNaN: true })
  return fc
    .record({
      junction: anyPoint,
      heading,
      between: fc.double({ ...degrees, noNaN: true }),
      lengthA: length,
      lengthB: length,
      swapA: fc.boolean(),
      swapB: fc.boolean(),
      thicknesses,
    })
    .map((draw) => {
      const far = [
        towards(draw.junction, draw.heading, draw.lengthA),
        towards(
          draw.junction,
          draw.heading + (draw.between * Math.PI) / DEGREES_PER_HALF_TURN,
          draw.lengthB,
        ),
      ] as const
      const swaps = [draw.swapA, draw.swapB]
      const walls = far.map((end, index) =>
        swaps[index]
          ? wallBetween(`w${index}`, end, draw.junction)
          : wallBetween(`w${index}`, draw.junction, end),
      )
      return { walls, thicknesses: draw.thicknesses, junction: draw.junction }
    })
}

export function expectSharedCorners({ walls, thicknesses, junction }: MeetingWalls): void {
  const graph = buildWallGraph(walls)
  const footprints = wallFootprints(graph, thicknesses)
  const vertex = graph.vertices.findIndex(
    (candidate) => distance(candidate, junction) <= DERIVATION_LENGTH_TOLERANCE_MM,
  )

  expect(cornersAtVertex(graph, footprints, { edgeIndex: 0, vertexIndex: vertex })).toEqual(
    cornersAtVertex(graph, footprints, { edgeIndex: 1, vertexIndex: vertex }),
  )
}
