import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { Point, VoidContourKind } from '../../core'

import {
  OTHER_FACE,
  buildLayout,
  inwardLines,
  roleTriangles,
  tallyFaces,
  wallTallies,
  type Measure,
  type OpeningSpec,
  type Tally,
  type WallSpec,
} from './wall-winding-test-support'

// The face winding rule for the wall shapes the plain-wall test leaves out: every
// triangle of a vertical face winds, and carries vertex normals, away from the wall
// material. Outer faces point away from the solid; the reveals of an opening point
// into the opening. Each opening void here is convex, so its center lies on the
// inner side of every reveal, the curved heads included.

const WALL_LENGTH = 4000
// A 3-4-5 run and rise, so the diagonal wall is as long as the axis walls.
const DIAGONAL_END: Point = { x: 2400, y: 3200 }
const ORIGIN: Point = { x: 0, y: 0 }
const WINDOW = { width: 900, height: 1200, sill: 900 }
const DOOR = { width: 900, height: 2032, sill: 0 }
const CURVED_WINDOW = { width: 700, height: 1500, sill: 800 }
const FIRST_OPENING_AT = 1000
const SECOND_OPENING_AT = 3000
const CENTER_AT = WALL_LENGTH / 2
const BOTH_MEASURES: readonly Measure[] = ['windingInward', 'vertexNormalsInward']
const OUTER_CLASSES = ['long face', 'end cap']
const MITRED_CLASSES = ['long face', 'end cap', 'mitred end cap']
const WINDOW_REVEAL = ['jamb', 'sill', 'head']

// Every curved head the model offers, keyed by its void contour kind; the Record
// type fails to compile when a new head shape is added and not listed here.
const CURVED_HEAD_TYPES: Record<Exclude<VoidContourKind, 'rectangular'>, string> = {
  arched: 'arched-window',
  round: 'round-top-window',
  lancet: 'lancet-window',
}

/** A layout wall and the face classes it must build, beyond its opening reveals. */
interface CheckedWall extends WallSpec {
  readonly classes: readonly string[]
}

/** The reveal parts each opening must line, and the classes no wall may build. */
interface Expectation {
  readonly revealParts: readonly string[]
  readonly forbidden: readonly string[]
}

type Placement = Omit<OpeningSpec, 'name' | 'type'>

const opening = (name: string, type: string, placement: Placement): OpeningSpec => ({
  name,
  type,
  ...placement,
})

const requiredClasses = (wall: CheckedWall, revealParts: readonly string[]): string[] => [
  ...wall.classes,
  ...wall.openings.flatMap((spec) => revealParts.map((part) => `${part} (${spec.name})`)),
]

const strayLines = (label: string, tallies: Map<string, Tally>, forbidden: string[]): string[] =>
  [...tallies.entries()]
    .filter(([faceClass]) => forbidden.includes(faceClass))
    .map(([faceClass, tally]) => `${label}, ${faceClass}: ${tally.total} triangles were built`)

/**
 * Report lines for a layout: inward or missing triangles per required class, plus
 * any face class a wall must not build (a stray face, or a door sill).
 */
const layoutReport = (
  caseName: string,
  walls: readonly CheckedWall[],
  expectation: Expectation,
): string[] => {
  const group = buildLayout(walls)
  return walls.flatMap((wall) => {
    const tallies = wallTallies(group, wall)
    const label = `${caseName}, wall ${wall.id}`
    const classes = requiredClasses(wall, expectation.revealParts)
    return [
      ...inwardLines(tallies, { label, classes, measures: BOTH_MEASURES }),
      ...strayLines(label, tallies, [OTHER_FACE, ...expectation.forbidden]),
    ]
  })
}

const MITRE_PATHS: readonly { path: string; openings: OpeningSpec[] }[] = [
  { path: 'plain prism', openings: [] },
  {
    path: 'opening',
    openings: [opening('window', 'double-hung-window', { at: CENTER_AT, ...WINDOW })],
  },
]

describe('wall face winding for every wall shape', () => {
  it('winds every face of a wall with two openings away from the wall material', () => {
    const wall: CheckedWall = {
      id: 'two-openings',
      start: ORIGIN,
      end: DIAGONAL_END,
      openings: [
        opening('first window', 'double-hung-window', { at: FIRST_OPENING_AT, ...WINDOW }),
        opening('second window', 'double-hung-window', { at: SECOND_OPENING_AT, ...WINDOW }),
      ],
      classes: OUTER_CLASSES,
    }
    const expectation = { revealParts: WINDOW_REVEAL, forbidden: [] }
    expect(layoutReport('two openings', [wall], expectation)).toEqual([])
  })

  it('winds the jambs and head of a door that reaches the floor into the opening, with no sill face', () => {
    const wall: CheckedWall = {
      id: 'door',
      start: ORIGIN,
      end: { x: WALL_LENGTH, y: 0 },
      openings: [opening('door', 'single-swing-door', { at: CENTER_AT, ...DOOR })],
      classes: OUTER_CLASSES,
    }
    const expectation = { revealParts: ['jamb', 'head'], forbidden: ['sill (door)'] }
    expect(layoutReport('floor-reaching door', [wall], expectation)).toEqual([])
  })

  it.each(Object.entries(CURVED_HEAD_TYPES))(
    'winds the reveals along an %s head into the opening',
    (headShape, type) => {
      const wall: CheckedWall = {
        id: `${headShape}-head`,
        start: ORIGIN,
        end: DIAGONAL_END,
        openings: [opening(`${headShape} window`, type, { at: CENTER_AT, ...CURVED_WINDOW })],
        classes: OUTER_CLASSES,
      }
      const expectation = { revealParts: ['jamb', 'sill', 'curved head'], forbidden: [] }
      expect(layoutReport(`${headShape} head`, [wall], expectation)).toEqual([])
    },
  )

  it.each(MITRE_PATHS)(
    'winds the mitred ends of two walls at a corner outward on the $path path',
    ({ path, openings }) => {
      const corner: Point = { x: WALL_LENGTH, y: 0 }
      const walls: CheckedWall[] = [
        { id: 'first', start: ORIGIN, end: corner, openings, classes: MITRED_CLASSES },
        {
          id: 'second',
          start: corner,
          end: { x: WALL_LENGTH, y: WALL_LENGTH },
          openings: [],
          classes: MITRED_CLASSES,
        },
      ]
      const expectation = { revealParts: WINDOW_REVEAL, forbidden: [] }
      expect(layoutReport(`mitred corner (${path} path)`, walls, expectation)).toEqual([])
    },
  )
})

// Walls running out from the origin in plan, meeting at one junction there.
const JUNCTIONS: readonly { name: string; spokeEnds: Point[] }[] = [
  {
    name: 'T of three walls',
    spokeEnds: [
      { x: -WALL_LENGTH, y: 0 },
      { x: WALL_LENGTH, y: 0 },
      { x: 0, y: WALL_LENGTH },
    ],
  },
  {
    name: 'cross of four walls',
    spokeEnds: [
      { x: -WALL_LENGTH, y: 0 },
      { x: WALL_LENGTH, y: 0 },
      { x: 0, y: WALL_LENGTH },
      { x: 0, y: -WALL_LENGTH },
    ],
  },
]

const fillSideTallies = (spokeEnds: readonly Point[]): Map<string, Tally> => {
  const walls = spokeEnds.map((end, index) => ({
    id: `spoke-${index}`,
    start: ORIGIN,
    end,
    openings: [],
  }))
  const fills = buildLayout(walls).children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData.junctionKey !== undefined,
  )
  const sides = fills.flatMap((mesh) => roleTriangles(mesh, 'junction'))
  // Each side quad spans the base and the top, so the corner mean sits at the
  // center of the fill prism, inside it for a convex fill polygon.
  const corners = sides.flatMap((triangle) => triangle.corners)
  const center = corners
    .reduce((sum, corner) => sum.add(corner), new THREE.Vector3())
    .divideScalar(Math.max(corners.length, 1))
  return tallyFaces(sides, ({ centroid }) => ({
    faceClass: 'side face',
    outward: centroid.clone().sub(center),
  }))
}

describe('junction fill face winding', () => {
  it.each(JUNCTIONS)(
    'winds the side faces of the fill at a $name outward',
    ({ name, spokeEnds }) => {
      const report = inwardLines(fillSideTallies(spokeEnds), {
        label: `junction fill at a ${name}`,
        classes: ['side face'],
        measures: BOTH_MEASURES,
      })
      expect(report).toEqual([])
    },
  )
})
