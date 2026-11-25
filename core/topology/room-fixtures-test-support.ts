import { DEFAULT_WALL_THICKNESS_MM } from '../model/factories'
import type { Point, Wall } from '../model/types'

/** One floor's walls under a name that failure messages print. */
export interface FixtureFloor {
  readonly name: string
  readonly walls: readonly Wall[]
}

interface WallSpec {
  readonly id: string
  readonly start: Point
  readonly end: Point
  readonly thickness?: number
  readonly constructionProfile?: string
}

const MASONRY_PROFILE = 'solid-masonry-brick'
const MIXED_THICK_WALL_MM = 400
const UNIFORM_THICKNESS_MM = 200
const MIXED_RECTANGLE_THICKNESSES = [
  MIXED_THICK_WALL_MM,
  UNIFORM_THICKNESS_MM,
  UNIFORM_THICKNESS_MM,
  UNIFORM_THICKNESS_MM,
]
const UNIFORM_RECTANGLE_THICKNESSES = [
  UNIFORM_THICKNESS_MM,
  UNIFORM_THICKNESS_MM,
  UNIFORM_THICKNESS_MM,
  UNIFORM_THICKNESS_MM,
]

function wallsFrom(specs: readonly WallSpec[]): Wall[] {
  return specs.map((spec) => ({
    id: spec.id,
    start: spec.start,
    end: spec.end,
    thickness: spec.thickness ?? DEFAULT_WALL_THICKNESS_MM,
    ...(spec.constructionProfile === undefined
      ? {}
      : { constructionProfile: spec.constructionProfile }),
  }))
}

/** A single closed loop of four walls, 4000 by 3000. */
export function closedLoopWalls(): Wall[] {
  return wallsFrom([
    { id: 'loop-0', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
    { id: 'loop-1', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
    { id: 'loop-2', start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 } },
    { id: 'loop-3', start: { x: 0, y: 3000 }, end: { x: 0, y: 0 } },
  ])
}

/** The closed loop with a dangling stub wall that ends inside the room. */
export function loopWithStubWalls(): Wall[] {
  return wallsFrom([
    ...closedLoopWalls().map((wall) => ({ ...wall, id: wall.id.replace('loop', 'stub') })),
    { id: 'stub-4', start: { x: 4000, y: 0 }, end: { x: 3000, y: 1000 } },
  ])
}

/** An enclosure that a partition wall divides into two cells. */
export function partitionedEnclosureWalls(): Wall[] {
  return wallsFrom([
    { id: 'cell-0', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
    { id: 'cell-1', start: { x: 0, y: 3000 }, end: { x: 6000, y: 3000 } },
    { id: 'cell-2', start: { x: 0, y: 0 }, end: { x: 0, y: 3000 } },
    { id: 'cell-3', start: { x: 6000, y: 0 }, end: { x: 6000, y: 3000 } },
    { id: 'cell-4', start: { x: 3000, y: 0 }, end: { x: 3000, y: 3000 } },
  ])
}

/** Three walls that never close into a loop. */
export function openChainWalls(): Wall[] {
  return wallsFrom([
    { id: 'chain-0', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
    { id: 'chain-1', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
    { id: 'chain-2', start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 } },
  ])
}

/** A 2000 by 1000 rectangle on the centerline, one thickness per wall in order. */
export function centerlineRectangleWalls(thicknesses: readonly number[]): Wall[] {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: 1000 },
    { x: 0, y: 1000 },
  ]
  return wallsFrom(
    corners.map((start, index) => ({
      id: `rect-${index}`,
      start,
      end: corners[(index + 1) % corners.length] ?? start,
      ...(thicknesses[index] === undefined ? {} : { thickness: thicknesses[index] }),
    })),
  )
}

/** A 6000 loop with a free-standing 2000 loop inside it. */
export function loopInsideLoopWalls(): Wall[] {
  return wallsFrom([
    { id: 'outer-0', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
    { id: 'outer-1', start: { x: 6000, y: 0 }, end: { x: 6000, y: 6000 } },
    { id: 'outer-2', start: { x: 6000, y: 6000 }, end: { x: 0, y: 6000 } },
    { id: 'outer-3', start: { x: 0, y: 6000 }, end: { x: 0, y: 0 } },
    { id: 'inner-0', start: { x: 2000, y: 2000 }, end: { x: 4000, y: 2000 } },
    { id: 'inner-1', start: { x: 4000, y: 2000 }, end: { x: 4000, y: 4000 } },
    { id: 'inner-2', start: { x: 4000, y: 4000 }, end: { x: 2000, y: 4000 } },
    { id: 'inner-3', start: { x: 2000, y: 4000 }, end: { x: 2000, y: 2000 } },
  ])
}

/** Two rooms that share an interior wall at x = 4000. */
export function sharedInteriorWallWalls(): Wall[] {
  const thickness = UNIFORM_THICKNESS_MM
  return wallsFrom([
    { id: 'shared-0', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness },
    { id: 'shared-1', start: { x: 4000, y: 0 }, end: { x: 8000, y: 0 }, thickness },
    { id: 'shared-2', start: { x: 8000, y: 0 }, end: { x: 8000, y: 3000 }, thickness },
    { id: 'shared-3', start: { x: 8000, y: 3000 }, end: { x: 4000, y: 3000 }, thickness },
    { id: 'shared-4', start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 }, thickness },
    { id: 'shared-5', start: { x: 0, y: 3000 }, end: { x: 0, y: 0 }, thickness },
    { id: 'shared-6', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 }, thickness },
  ])
}

/** Perimeter walls that span a partition and so bound both rooms. */
export function spanningPerimeterPartitionWalls(): Wall[] {
  const thickness = UNIFORM_THICKNESS_MM
  return wallsFrom([
    { id: 'span-0', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness },
    { id: 'span-1', start: { x: 0, y: 3000 }, end: { x: 6000, y: 3000 }, thickness },
    { id: 'span-2', start: { x: 0, y: 0 }, end: { x: 0, y: 3000 }, thickness },
    { id: 'span-3', start: { x: 6000, y: 0 }, end: { x: 6000, y: 3000 }, thickness },
    { id: 'span-4', start: { x: 3000, y: 0 }, end: { x: 3000, y: 3000 }, thickness },
  ])
}

/** A 2000 by 1000 rectangle of walls that all take the solid masonry profile. */
export function masonryRectangleWalls(): Wall[] {
  const constructionProfile = MASONRY_PROFILE
  return wallsFrom([
    { id: 'masonry-0', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, constructionProfile },
    { id: 'masonry-1', start: { x: 2000, y: 0 }, end: { x: 2000, y: 1000 }, constructionProfile },
    { id: 'masonry-2', start: { x: 2000, y: 1000 }, end: { x: 0, y: 1000 }, constructionProfile },
    { id: 'masonry-3', start: { x: 0, y: 1000 }, end: { x: 0, y: 0 }, constructionProfile },
  ])
}

/**
 * The wall sets that the room tests of core/topology build inline, copied so the parity test can
 * read them. Fresh on each call.
 */
export function roomFixtureFloors(): readonly FixtureFloor[] {
  const rectangle = (name: string, thicknesses: readonly number[]): FixtureFloor => ({
    name: `inline: ${name}`,
    walls: centerlineRectangleWalls(thicknesses),
  })
  return [
    { name: 'inline: single closed loop', walls: closedLoopWalls() },
    { name: 'inline: closed loop with a dangling stub', walls: loopWithStubWalls() },
    { name: 'inline: enclosure split by a partition', walls: partitionedEnclosureWalls() },
    { name: 'inline: open chain of three walls', walls: openChainWalls() },
    rectangle('rectangle of uniform thickness', UNIFORM_RECTANGLE_THICKNESSES),
    rectangle('rectangle with one thick wall', MIXED_RECTANGLE_THICKNESSES),
    { name: 'inline: free-standing loop inside a loop', walls: loopInsideLoopWalls() },
    { name: 'inline: two rooms sharing an interior wall', walls: sharedInteriorWallWalls() },
    {
      name: 'inline: perimeter walls that span a partition',
      walls: spanningPerimeterPartitionWalls(),
    },
    { name: 'inline: rectangle of masonry walls', walls: masonryRectangleWalls() },
  ]
}
