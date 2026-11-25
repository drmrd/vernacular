/**
 * The wall vocabulary shared by the plan generators (styles, wall literals, ring helpers),
 * the hard cases, and `splitWallAt`.
 */
import fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import { DERIVATION_LENGTH_TOLERANCE_MM } from '../geometry/tolerance'
import type { Point, Wall } from '../model/types'

const PARTITION_THICKNESS_MM = 100
const FOUR_AND_A_HALF_INCH_THICKNESS_MM = 114.3
const STUD_THICKNESS_MM = 150
const BRICK_THICKNESS_MM = 230
const THICK_THICKNESS_MM = 300
const MASSIVE_THICKNESS_MM = 450

/** The thicknesses of a free-standing loop, thin enough that its inset never collapses. */
export const THIN_WALL_THICKNESSES_MM: readonly number[] = [
  0,
  PARTITION_THICKNESS_MM,
  FOUR_AND_A_HALF_INCH_THICKNESS_MM,
  STUD_THICKNESS_MM,
]

/** The wall thicknesses the generators draw from, in millimeters. Zero is a wall without thickness. */
export const WALL_THICKNESSES_MM: readonly number[] = [
  ...THIN_WALL_THICKNESSES_MM,
  BRICK_THICKNESS_MM,
  THICK_THICKNESS_MM,
  MASSIVE_THICKNESS_MM,
]

const CONSTRUCTION_PROFILE_IDS = [
  'platform-framed-drywall',
  'balloon-framed-lath-and-plaster',
  'solid-masonry-brick',
  'unknown-construction-profile',
] as const

const WALLS_WITHOUT_PROFILE_WEIGHT = 3
const WALLS_WITH_PROFILE_WEIGHT = 1

/** How a generated wall is dressed: its thickness, its construction profile, and its end order. */
export interface WallStyle {
  readonly thickness: number
  readonly profile: string | undefined
  readonly swap: boolean
}

/** One wall in four carries a construction profile, and one profile id is unknown so the fallback runs. */
const profileArbitrary: Arbitrary<string | undefined> = fc.oneof(
  { weight: WALLS_WITHOUT_PROFILE_WEIGHT, arbitrary: fc.constant(undefined) },
  { weight: WALLS_WITH_PROFILE_WEIGHT, arbitrary: fc.constantFrom(...CONSTRUCTION_PROFILE_IDS) },
)

/** The style that stands in when a draw list is shorter than the walls (not reached in practice). */
export const NO_STYLE: WallStyle = { thickness: 0, profile: undefined, swap: false }

export const wallStyleArbitrary: Arbitrary<WallStyle> = fc.record({
  thickness: fc.constantFrom(...WALL_THICKNESSES_MM),
  profile: profileArbitrary,
  swap: fc.boolean(),
})

/** The two points a wall joins, before the style decides which one is its start. */
export interface WallEnds {
  readonly a: Point
  readonly b: Point
}

/** Builds a `Wall` literal directly, because `createWall` takes no profile and draws a random id. */
export function makeWall(id: string, ends: WallEnds, style: WallStyle): Wall {
  const [start, end] = style.swap ? [ends.b, ends.a] : [ends.a, ends.b]
  const wall: Wall = { id, start, end, thickness: style.thickness }
  return style.profile === undefined ? wall : { ...wall, constructionProfile: style.profile }
}

export const FULL_TURN = 2 * Math.PI

/** A draw from 0 to 1. */
export const unit = fc.double({ min: 0, max: 1, noNaN: true })

/** The point at `fraction` of the way from `a` to `b`. */
export function lerp(a: Point, b: Point, fraction: number): Point {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }
}

/** The item at `index`, counted around the list, so the last item is followed by the first. */
export function cyclic<T>(items: readonly T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length]
  if (item === undefined) throw new RangeError('the list is empty')
  return item
}

/** The smallest turn, in radians, between a corner's incoming and outgoing side in a closed ring. */
export function sharpestTurn(corners: readonly { x: number; y: number }[]): number {
  const turns = corners.map((corner, k) => {
    const before = cyclic(corners, k - 1)
    const after = cyclic(corners, k + 1)
    const inX = corner.x - before.x
    const inY = corner.y - before.y
    const outX = after.x - corner.x
    const outY = after.y - corner.y
    return Math.atan2(Math.abs(inX * outY - inY * outX), inX * outX + inY * outY)
  })
  return Math.min(...turns)
}

/** The kinds of awkward input the derivation must still return for. */
export type HardCase =
  | 'copy'
  | 'partial-overlap'
  | 'zero-length'
  | 'near-junction-inside'
  | 'near-junction-outside'
  | 'near-parallel'

export const ALL_HARD_CASES: readonly HardCase[] = [
  'copy',
  'partial-overlap',
  'zero-length',
  'near-junction-inside',
  'near-junction-outside',
  'near-parallel',
]

const OVERLAP_START_MIN = -0.3
const OVERLAP_START_SPAN = 1.2
const OVERLAP_MIN_LENGTH = 0.1
const OVERLAP_END_MAX = 1.3

/**
 * The longest zero-length wall, as a share of the derivation tolerance. A wall longer than the
 * tolerance whose two ends merge into one junction (a length in (tol, 2 * tol]) becomes a
 * self-loop edge, and the face walk then pushes without end (#1146). The share stops short of 1
 * because lengths up to the tolerance itself came out a hair over it after rounding.
 */
const ZERO_LENGTH_MAX_SHARE = 0.9
const NEAR_INSIDE_MIN_SHARE = 0.05
const NEAR_INSIDE_SPAN_SHARE = 0.9
const NEAR_OUTSIDE_MIN_SHARE = 1.05
const NEAR_OUTSIDE_SPAN_SHARE = 1.95
const NEAR_PARALLEL_MIN_MM = 1e-6
const NEAR_PARALLEL_MAX_SHARE = 5

/**
 * The random choices behind one application of a hard case. Each case reads the fields as follows.
 * - `pick`: the index of the base wall (copy, partial-overlap, zero-length, near-parallel), or of
 *   the joint group or joint end (zero-length at a joint, both near-junction cases).
 * - `fractionA`: the start of the overlap (partial-overlap), the position along the base wall
 *   (zero-length), the distance as a share of the tolerance (both near-junction cases), or the
 *   log-scale exponent of the sideways offset (near-parallel).
 * - `fractionB`: the spare share of the overlap range (partial-overlap), or the length as a share
 *   of the longest zero-length wall (zero-length).
 * - `angle`: the direction of the zero-length wall or of the end move.
 * - `atJoint`: whether the zero-length wall sits on a joint and not along a wall.
 * - `style`: the style of the wall a case adds.
 */
export interface HardCaseDraw {
  readonly pick: number
  readonly fractionA: number
  readonly fractionB: number
  readonly angle: number
  readonly atJoint: boolean
  readonly style: WallStyle
}

const hardCaseDrawArbitrary: Arbitrary<HardCaseDraw> = fc.record({
  pick: fc.nat(),
  fractionA: unit,
  fractionB: unit,
  angle: fc.double({ min: 0, max: FULL_TURN, noNaN: true }),
  atJoint: fc.boolean(),
  style: wallStyleArbitrary,
})

/** A hard case applied once, or twice when `twice` is set. */
export interface HardCaseRepeat {
  readonly first: HardCaseDraw
  readonly second: HardCaseDraw
  readonly twice: boolean
}

/** One draw of `count` repeats, one for each listed hard case. */
export function hardCaseRepeatsArbitrary(count: number): Arbitrary<readonly HardCaseRepeat[]> {
  const repeat = fc.record({
    first: hardCaseDrawArbitrary,
    second: hardCaseDrawArbitrary,
    twice: fc.boolean(),
  })
  return fc.array(repeat, { minLength: count, maxLength: count })
}

interface HardCaseWork {
  readonly walls: Wall[]
  readonly baseCount: number
  readonly id: string
}

interface WallEnd {
  readonly index: number
  readonly name: 'start' | 'end'
  readonly point: Point
}

function baseWall(site: HardCaseWork, draw: HardCaseDraw): Wall {
  const wall = site.walls[draw.pick % site.baseCount]
  if (wall === undefined) throw new RangeError('no base wall to act on')
  return wall
}

/** Groups the ends of base walls that share an exact point, keeping groups of two or more. */
function jointGroups(site: HardCaseWork): WallEnd[][] {
  const groups = new Map<string, WallEnd[]>()
  site.walls.slice(0, site.baseCount).forEach((wall, index) => {
    const ends: WallEnd[] = [
      { index, name: 'start', point: wall.start },
      { index, name: 'end', point: wall.end },
    ]
    for (const end of ends) {
      const key = `${end.point.x},${end.point.y}`
      groups.set(key, [...(groups.get(key) ?? []), end])
    }
  })
  return [...groups.values()].filter((group) => group.length > 1)
}

function copyWall(site: HardCaseWork, draw: HardCaseDraw): void {
  site.walls.push({ ...baseWall(site, draw), id: site.id })
}

function addPartialOverlap(site: HardCaseWork, draw: HardCaseDraw): void {
  const target = baseWall(site, draw)
  const lo = OVERLAP_START_MIN + OVERLAP_START_SPAN * draw.fractionA
  const slack = OVERLAP_END_MAX - lo - OVERLAP_MIN_LENGTH
  const hi = lo + OVERLAP_MIN_LENGTH + slack * draw.fractionB
  const a = lerp(target.start, target.end, lo)
  const b = lerp(target.start, target.end, hi)
  site.walls.push(makeWall(site.id, { a, b }, draw.style))
}

function addZeroLength(site: HardCaseWork, draw: HardCaseDraw): void {
  const groups = jointGroups(site)
  const group = groups[draw.pick % Math.max(groups.length, 1)]
  const target = baseWall(site, draw)
  const center =
    draw.atJoint && group?.[0] ? group[0].point : lerp(target.start, target.end, draw.fractionA)
  const halfLength = (draw.fractionB * ZERO_LENGTH_MAX_SHARE * DERIVATION_LENGTH_TOLERANCE_MM) / 2
  const offset = { x: halfLength * Math.cos(draw.angle), y: halfLength * Math.sin(draw.angle) }
  const a = { x: center.x - offset.x, y: center.y - offset.y }
  const b = { x: center.x + offset.x, y: center.y + offset.y }
  site.walls.push(makeWall(site.id, { a, b }, draw.style))
}

function moveJointEnd(site: HardCaseWork, draw: HardCaseDraw, distance: number): void {
  const ends = jointGroups(site).flat()
  const end = ends[draw.pick % Math.max(ends.length, 1)]
  const wall = end === undefined ? undefined : site.walls[end.index]
  if (end === undefined || wall === undefined) return
  const moved = {
    x: end.point.x + distance * Math.cos(draw.angle),
    y: end.point.y + distance * Math.sin(draw.angle),
  }
  site.walls[end.index] = end.name === 'start' ? { ...wall, start: moved } : { ...wall, end: moved }
}

function moveEndInside(site: HardCaseWork, draw: HardCaseDraw): void {
  const share = NEAR_INSIDE_MIN_SHARE + NEAR_INSIDE_SPAN_SHARE * draw.fractionA
  moveJointEnd(site, draw, share * DERIVATION_LENGTH_TOLERANCE_MM)
}

function moveEndOutside(site: HardCaseWork, draw: HardCaseDraw): void {
  const share = NEAR_OUTSIDE_MIN_SHARE + NEAR_OUTSIDE_SPAN_SHARE * draw.fractionA
  moveJointEnd(site, draw, share * DERIVATION_LENGTH_TOLERANCE_MM)
}

/** A wall from a base wall's start to its end, with the end moved sideways on a log scale. */
function addNearParallel(site: HardCaseWork, draw: HardCaseDraw): void {
  const { start, end } = baseWall(site, draw)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const maxMm = NEAR_PARALLEL_MAX_SHARE * DERIVATION_LENGTH_TOLERANCE_MM
  const sideways = NEAR_PARALLEL_MIN_MM * (maxMm / NEAR_PARALLEL_MIN_MM) ** draw.fractionA
  const moved = {
    x: end.x - ((end.y - start.y) / length) * sideways,
    y: end.y + ((end.x - start.x) / length) * sideways,
  }
  site.walls.push(makeWall(site.id, { a: start, b: moved }, draw.style))
}

function applyHardCase(site: HardCaseWork, kind: HardCase, draw: HardCaseDraw): void {
  switch (kind) {
    case 'copy':
      return copyWall(site, draw)
    case 'partial-overlap':
      return addPartialOverlap(site, draw)
    case 'zero-length':
      return addZeroLength(site, draw)
    case 'near-junction-inside':
      return moveEndInside(site, draw)
    case 'near-junction-outside':
      return moveEndOutside(site, draw)
    case 'near-parallel':
      return addNearParallel(site, draw)
  }
}

/**
 * Applies each listed case once or twice, and only to the base walls (the walls before any case
 * ran). A case that acted on another case's wall once divided by zero and fed NaN coordinates to
 * the derivation, which is a generator bug and not a kernel defect. New walls get the ids
 * `h0`, `h1`, and so on.
 */
export function applyHardCases(
  base: readonly Wall[],
  cases: readonly HardCase[],
  repeats: readonly HardCaseRepeat[],
): Wall[] {
  const walls = [...base]
  if (base.length === 0) return walls
  let serial = 0
  cases.forEach((kind, index) => {
    const repeat = repeats[index]
    if (repeat === undefined) return
    const draws = repeat.twice ? [repeat.first, repeat.second] : [repeat.first]
    for (const draw of draws) {
      applyHardCase({ walls, baseCount: base.length, id: `h${serial}` }, kind, draw)
      serial += 1
    }
  })
  return walls
}

/** A generated set of walls, with a label that names its family and counts for a failure report. */
export interface GeneratedPlan {
  readonly walls: readonly Wall[]
  readonly label: string
}

/**
 * Replaces the wall at `wallIndex` with `<id>-a` (start to the split point) and `<id>-b` (the split
 * point to end), where the split point lies `fraction` of the way along. Both pieces keep the
 * thickness and the profile, and sit where the wall was in the order. Throws `RangeError` for an
 * index out of range or a fraction outside (0, 1).
 */
export function splitWallAt(
  plan: GeneratedPlan,
  wallIndex: number,
  fraction: number,
): GeneratedPlan {
  const wall = plan.walls[wallIndex]
  if (wall === undefined) throw new RangeError(`wall index ${wallIndex} is out of range`)
  if (!(fraction > 0 && fraction < 1)) {
    throw new RangeError(`fraction ${fraction} is not inside (0, 1)`)
  }
  const point = lerp(wall.start, wall.end, fraction)
  const pieces = [
    { ...wall, id: `${wall.id}-a`, end: point },
    { ...wall, id: `${wall.id}-b`, start: point },
  ]
  return {
    walls: [...plan.walls.slice(0, wallIndex), ...pieces, ...plan.walls.slice(wallIndex + 1)],
    label: `${plan.label} split ${wall.id} at ${fraction}`,
  }
}
