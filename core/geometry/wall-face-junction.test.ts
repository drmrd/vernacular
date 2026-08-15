import { describe, expect, it } from 'vitest'

import type { Point, Wall } from '../model/types'
import { wallFootprints } from '../topology/wall-footprint'
import { buildWallGraph } from '../topology/wall-graph'
import { distance } from './point'
import { segmentIntersection } from './segment'
import { dot, subtract } from './vector'
import type { WallFaceGap, WallFaceRun, WallFaceStretch } from './wall-face'
import { wallFaceGeometry } from './wall-face'

/** A plastered two-by-four partition, the wall an old house is mostly built from. */
const THICKNESS_MM = 114
const HALF_MM = THICKNESS_MM / 2
const ARM_LENGTH_MM = 1000
const COORDINATE_DIGITS = 6
const COINCIDENT_TOLERANCE_MM = 1e-6

/**
 * How far a 45 degree miter reaches along the run axis: half a thickness times
 * cot(22.5 degrees), and cot(22.5 degrees) is 1 + sqrt(2). On the acute side the
 * miter reaches backward, pulling that face corner short of the run's own end.
 */
const MITER_REACH_MM = HALF_MM * (1 + Math.SQRT2)

/** A doorway hard against the acute corner, the way old houses routinely place one. */
const CORNER_DOORWAY: WallFaceGap = { from: 900, to: 950 }

/** A doorway in the clear middle of the same run, well short of either miter. */
const MID_RUN_DOORWAY: WallFaceGap = { from: 200, to: 300 }

const required = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}

const wallOf = (id: string, start: Point, end: Point): Wall => ({
  id,
  start,
  end,
  thickness: THICKNESS_MM,
})

/**
 * The east arm of two walls meeting at 45 degrees, mitred by the same graph and
 * footprint helpers the plan renderer uses, so the corners fed in here are the
 * ones production geometry produces.
 */
const acuteCornerRun = (gaps: readonly WallFaceGap[]): WallFaceRun => {
  const meet: Point = { x: ARM_LENGTH_MM, y: 0 }
  const graph = buildWallGraph([
    wallOf('east', { x: 0, y: 0 }, meet),
    wallOf('spur', meet, {
      x: meet.x - ARM_LENGTH_MM * Math.SQRT1_2,
      y: ARM_LENGTH_MM * Math.SQRT1_2,
    }),
  ])
  const footprints = wallFootprints(
    graph,
    graph.edges.map(() => THICKNESS_MM),
  )
  const east = required(graph.edges[0], 'the east edge')
  return {
    start: required(graph.vertices[east.a], 'a start vertex'),
    end: required(graph.vertices[east.b], 'an end vertex'),
    corners: required(footprints[0], 'the east footprint'),
    gaps,
  }
}

/** The two non-adjacent edges of a four-corner ring, as pairs of corner indexes. */
const OPPOSED_EDGES = [
  [0, 1, 2, 3],
  [1, 2, 3, 0],
] as const

const ringEdge = (ring: readonly Point[], from: number, to: number): [Point, Point] => [
  required(ring[from], 'a poche corner'),
  required(ring[to], 'a poche corner'),
]

/**
 * A simple ring does not cross itself. Adjacent edges always touch at the corner
 * they share, so only the two non-adjacent pairs can cross, and a crossing there
 * is a bow tie: the fill then paints the wrong region.
 */
const expectSimplePoche = ({ poche }: WallFaceStretch): void => {
  for (const [first, second, third, fourth] of OPPOSED_EDGES) {
    const edge = ringEdge(poche, first, second)
    const opposed = ringEdge(poche, third, fourth)
    // A face cut back onto its own corner collapses the ring to a triangle. The
    // collapsed edge shares a corner with its opposite, which touches rather
    // than crosses, so it is not a bow tie and does not belong in this check.
    if (distance(...edge) < COINCIDENT_TOLERANCE_MM) continue
    if (distance(...opposed) < COINCIDENT_TOLERANCE_MM) continue
    expect(segmentIntersection(...edge, ...opposed)).toBeNull()
  }
}

/**
 * Positive when both face lines of a stretch advance the same way along the run
 * axis. Negative means one face runs backward while the other runs forward, the
 * signature of a bow tie.
 */
const faceAgreement = ({ plusFace, minusFace }: WallFaceStretch): number =>
  dot(subtract(plusFace[1], plusFace[0]), subtract(minusFace[1], minusFace[0]))

const expectStretchIsSimple = (stretch: WallFaceStretch): void => {
  expect(faceAgreement(stretch)).toBeGreaterThanOrEqual(0)
  expectSimplePoche(stretch)
}

describe('wallFaceGeometry where an opening reaches a mitred corner', () => {
  it('keeps every poche ring simple when a doorway jamb sits past the pulled-back miter', () => {
    const run = acuteCornerRun([CORNER_DOORWAY])
    // The acute miter pulls the plus corner back short of the run's own end at
    // x = 1000, so the near jamb at x = 900 already lies beyond that face.
    expect(run.corners.bPlus.x).toBeCloseTo(ARM_LENGTH_MM - MITER_REACH_MM, COORDINATE_DIGITS)
    expect(run.corners.bPlus.x).toBeLessThan(CORNER_DOORWAY.from)

    for (const stretch of wallFaceGeometry(run)) expectStretchIsSimple(stretch)
  })

  it('still cuts two simple stretches for a doorway in the clear middle of the run', () => {
    const stretches = wallFaceGeometry(acuteCornerRun([MID_RUN_DOORWAY]))

    expect(stretches).toHaveLength(2)
    for (const stretch of stretches) expectStretchIsSimple(stretch)
  })
})
