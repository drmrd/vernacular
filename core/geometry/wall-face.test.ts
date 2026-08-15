import { describe, expect, it } from 'vitest'

import type { Point, Wall } from '../model/types'
import { wallFootprints } from '../topology/wall-footprint'
import { buildWallGraph } from '../topology/wall-graph'
import { distance } from './point'
import type { WallFaceCorners, WallFaceGap, WallFaceRun, WallFaceStretch } from './wall-face'
import { wallFaceGeometry } from './wall-face'

const THICKNESS_MM = 100
const HALF_MM = THICKNESS_MM / 2
const ARM_LENGTH_MM = 1000
const RUN_LENGTH_MM = 4000
const COORDINATE_DIGITS = 6
const COINCIDENT_TOLERANCE_MM = 1e-6

const required = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}

const expectPointCloseTo = (actual: Point, expected: Point): void => {
  expect(actual.x).toBeCloseTo(expected.x, COORDINATE_DIGITS)
  expect(actual.y).toBeCloseTo(expected.y, COORDINATE_DIGITS)
}

const includesPoint = (ring: readonly Point[], expected: Point): boolean =>
  ring.some((corner) => distance(corner, expected) < COINCIDENT_TOLERANCE_MM)

/** Signed perpendicular distance from the run centerline, positive on the +normal side. */
const faceOffset = (run: WallFaceRun, point: Point): number => {
  const along = { x: run.end.x - run.start.x, y: run.end.y - run.start.y }
  return (
    ((point.y - run.start.y) * along.x - (point.x - run.start.x) * along.y) /
    Math.hypot(along.x, along.y)
  )
}

const onlyStretch = (run: WallFaceRun): WallFaceStretch =>
  required(wallFaceGeometry(run)[0], 'a stretch')

const expectPocheTracesFaces = (stretch: WallFaceStretch): void => {
  expectPointCloseTo(stretch.poche[0], stretch.plusFace[0])
  expectPointCloseTo(stretch.poche[1], stretch.plusFace[1])
  expectPointCloseTo(stretch.poche[2], stretch.minusFace[1])
  expectPointCloseTo(stretch.poche[3], stretch.minusFace[0])
}

const wallOf = (id: string, start: Point, end: Point): Wall => ({
  id,
  start,
  end,
  thickness: THICKNESS_MM,
})

interface MitredRun {
  wallId: string
  run: WallFaceRun
}

/**
 * Compose the graph and footprint helpers exactly the way the plan renderer will,
 * so the mitred corners fed in here are the ones production geometry produces.
 */
const mitredRuns = (walls: readonly Wall[]): MitredRun[] => {
  const graph = buildWallGraph(walls)
  const footprints = wallFootprints(
    graph,
    graph.edges.map(() => THICKNESS_MM),
  )
  return graph.edges.map((edge, index) => ({
    wallId: edge.wallId,
    run: {
      start: required(graph.vertices[edge.a], 'a start vertex'),
      end: required(graph.vertices[edge.b], 'an end vertex'),
      corners: required(footprints[index], 'a footprint'),
    },
  }))
}

const straightCorners: WallFaceCorners = {
  aPlus: { x: 0, y: HALF_MM },
  aMinus: { x: 0, y: -HALF_MM },
  bPlus: { x: RUN_LENGTH_MM, y: HALF_MM },
  bMinus: { x: RUN_LENGTH_MM, y: -HALF_MM },
}

const straightRun = (gaps: readonly WallFaceGap[]): WallFaceRun => ({
  start: { x: 0, y: 0 },
  end: { x: RUN_LENGTH_MM, y: 0 },
  corners: straightCorners,
  gaps,
})

const expectStraightSpan = (stretch: WallFaceStretch, from: number, to: number): void => {
  expectPointCloseTo(stretch.plusFace[0], { x: from, y: HALF_MM })
  expectPointCloseTo(stretch.plusFace[1], { x: to, y: HALF_MM })
  expectPointCloseTo(stretch.minusFace[0], { x: from, y: -HALF_MM })
  expectPointCloseTo(stretch.minusFace[1], { x: to, y: -HALF_MM })
}

describe('wallFaceGeometry at wall junctions', () => {
  it('traces one solid stretch from corner to corner when no opening breaks the run', () => {
    const stretches = wallFaceGeometry({
      start: { x: 0, y: 0 },
      end: { x: RUN_LENGTH_MM, y: 0 },
      corners: straightCorners,
    })

    expect(stretches).toHaveLength(1)
    const solid = required(stretches[0], 'a stretch')
    expectPointCloseTo(solid.plusFace[0], straightCorners.aPlus)
    expectPointCloseTo(solid.plusFace[1], straightCorners.bPlus)
    expectPointCloseTo(solid.minusFace[0], straightCorners.aMinus)
    expectPointCloseTo(solid.minusFace[1], straightCorners.bMinus)
    expect(solid.poche).toHaveLength(4)
    expectPointCloseTo(solid.poche[0], straightCorners.aPlus)
    expectPointCloseTo(solid.poche[1], straightCorners.bPlus)
    expectPointCloseTo(solid.poche[2], straightCorners.bMinus)
    expectPointCloseTo(solid.poche[3], straightCorners.aMinus)
  })

  it('tiles a square corner by sharing both miter points between the two poche rings', () => {
    const corner: Point = { x: ARM_LENGTH_MM, y: 0 }
    const runs = mitredRuns([
      wallOf('east', { x: 0, y: 0 }, corner),
      wallOf('north', corner, { x: corner.x, y: ARM_LENGTH_MM }),
    ])
    // A right-angle miter between two walls of the same thickness sits half a
    // thickness off the shared vertex in each axis.
    const innerMiter = { x: corner.x - HALF_MM, y: corner.y + HALF_MM }
    const outerMiter = { x: corner.x + HALF_MM, y: corner.y - HALF_MM }

    expect(runs).toHaveLength(2)
    for (const { run } of runs) {
      const { poche } = onlyStretch(run)
      expect(includesPoint(poche, innerMiter)).toBe(true)
      expect(includesPoint(poche, outerMiter)).toBe(true)
    }
  })

  it('keeps each T-junction poche on its own faces and stops the stub at the through face', () => {
    const tee: Point = { x: ARM_LENGTH_MM, y: 0 }
    const runs = mitredRuns([
      wallOf('through', { x: 0, y: 0 }, { x: 2 * ARM_LENGTH_MM, y: 0 }),
      wallOf('partition', tee, { x: tee.x, y: ARM_LENGTH_MM }),
    ])

    // The tee splits the through-wall, so three runs meet at the shared vertex.
    expect(runs).toHaveLength(3)
    for (const { run } of runs) {
      for (const corner of onlyStretch(run).poche) {
        expect(Math.abs(faceOffset(run, corner))).toBeCloseTo(HALF_MM, COORDINATE_DIGITS)
      }
    }

    const stub = required(
      runs.find((candidate) => candidate.wallId === 'partition'),
      'the partition run',
    )
    const { poche } = onlyStretch(stub.run)
    // The stub stops on the through-wall near face rather than crossing into it.
    for (const corner of poche) {
      expect(corner.y).toBeGreaterThanOrEqual(HALF_MM - COINCIDENT_TOLERANCE_MM)
    }
    expect(includesPoint(poche, { x: tee.x - HALF_MM, y: HALF_MM })).toBe(true)
    expect(includesPoint(poche, { x: tee.x + HALF_MM, y: HALF_MM })).toBe(true)
  })

  it('reaches farther than a square corner where two walls meet at 45 degrees', () => {
    const meet: Point = { x: ARM_LENGTH_MM, y: 0 }
    const runs = mitredRuns([
      wallOf('east', { x: 0, y: 0 }, meet),
      wallOf('spur', meet, {
        x: meet.x - ARM_LENGTH_MM * Math.SQRT1_2,
        y: ARM_LENGTH_MM * Math.SQRT1_2,
      }),
    ])
    // A 45 degree wedge miters HALF_MM / tan(22.5 degrees) along the east run axis,
    // and cot(22.5 degrees) is 1 + sqrt(2).
    const reachAlongAxis = HALF_MM * (1 + Math.SQRT2)
    const acuteMiter = { x: meet.x - reachAlongAxis, y: HALF_MM }
    const obtuseMiter = { x: meet.x + reachAlongAxis, y: -HALF_MM }
    const squareCornerReach = HALF_MM * Math.SQRT2

    expect(runs).toHaveLength(2)
    expect(distance(meet, acuteMiter)).toBeGreaterThan(squareCornerReach)
    expect(distance(meet, obtuseMiter)).toBeGreaterThan(squareCornerReach)
    for (const { run } of runs) {
      const { poche } = onlyStretch(run)
      expect(includesPoint(poche, acuteMiter)).toBe(true)
      expect(includesPoint(poche, obtuseMiter)).toBe(true)
    }
  })
})

describe('wallFaceGeometry around openings', () => {
  it('splits the run into two stretches cut square across the axis at the opening edges', () => {
    const openingFrom = 1000
    const openingTo = 2000

    const stretches = wallFaceGeometry(straightRun([{ from: openingFrom, to: openingTo }]))

    expect(stretches).toHaveLength(2)
    const before = required(stretches[0], 'the stretch before the opening')
    const after = required(stretches[1], 'the stretch after the opening')
    expectStraightSpan(before, 0, openingFrom)
    expectStraightSpan(after, openingTo, RUN_LENGTH_MM)
    expectPocheTracesFaces(before)
    expectPocheTracesFaces(after)
    // Perpendicular cut: both faces stop at the same distance along the centerline.
    expect(before.plusFace[1].x).toBeCloseTo(before.minusFace[1].x, COORDINATE_DIGITS)
    expect(after.plusFace[0].x).toBeCloseTo(after.minusFace[0].x, COORDINATE_DIGITS)
  })

  it('emits one more stretch than the number of interior openings', () => {
    const stretches = wallFaceGeometry(
      straightRun([
        { from: 1000, to: 1500 },
        { from: 2500, to: 3000 },
      ]),
    )

    expect(stretches).toHaveLength(3)
    expectStraightSpan(required(stretches[0], 'the first stretch'), 0, 1000)
    expectStraightSpan(required(stretches[1], 'the middle stretch'), 1500, 2500)
    expectStraightSpan(required(stretches[2], 'the last stretch'), 3000, RUN_LENGTH_MM)
  })

  it('drops the stretch on the side where an opening reaches the run end', () => {
    const openAtStart = wallFaceGeometry(straightRun([{ from: 0, to: 1000 }]))
    expect(openAtStart).toHaveLength(1)
    expectStraightSpan(required(openAtStart[0], 'a stretch'), 1000, RUN_LENGTH_MM)

    const openAtEnd = wallFaceGeometry(straightRun([{ from: 3000, to: RUN_LENGTH_MM }]))
    expect(openAtEnd).toHaveLength(1)
    expectStraightSpan(required(openAtEnd[0], 'a stretch'), 0, 3000)
  })

  it('leaves no stretch when an opening covers the whole run', () => {
    expect(wallFaceGeometry(straightRun([{ from: 0, to: RUN_LENGTH_MM }]))).toEqual([])
  })

  it('normalizes openings supplied out of order', () => {
    const stretches = wallFaceGeometry(
      straightRun([
        { from: 2500, to: 3000 },
        { from: 1000, to: 1500 },
      ]),
    )

    expect(stretches).toHaveLength(3)
    expectStraightSpan(required(stretches[0], 'the first stretch'), 0, 1000)
    expectStraightSpan(required(stretches[1], 'the middle stretch'), 1500, 2500)
    expectStraightSpan(required(stretches[2], 'the last stretch'), 3000, RUN_LENGTH_MM)
  })

  it('treats two overlapping openings as the single merged span', () => {
    const stretches = wallFaceGeometry(
      straightRun([
        { from: 1000, to: 2000 },
        { from: 1500, to: 2500 },
      ]),
    )

    expect(stretches).toHaveLength(2)
    expectStraightSpan(required(stretches[0], 'the stretch before the openings'), 0, 1000)
    expectStraightSpan(
      required(stretches[1], 'the stretch after the openings'),
      2500,
      RUN_LENGTH_MM,
    )
  })

  it('clamps an opening that runs past the ends so no face point leaves the run', () => {
    const stretches = wallFaceGeometry(straightRun([{ from: -500, to: 1000 }]))

    expect(stretches).toHaveLength(1)
    const stretch = required(stretches[0], 'a stretch')
    expectStraightSpan(stretch, 1000, RUN_LENGTH_MM)
    for (const corner of stretch.poche) {
      expect(corner.x).toBeGreaterThanOrEqual(0)
      expect(corner.x).toBeLessThanOrEqual(RUN_LENGTH_MM)
    }
  })

  it('leaves no stretch for a zero-length run', () => {
    const degenerate: WallFaceRun = {
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      corners: {
        aPlus: { x: 0, y: HALF_MM },
        aMinus: { x: 0, y: -HALF_MM },
        bPlus: { x: 0, y: HALF_MM },
        bMinus: { x: 0, y: -HALF_MM },
      },
    }

    expect(wallFaceGeometry(degenerate)).toEqual([])
  })
})
