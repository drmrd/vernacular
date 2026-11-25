import { registerWallStretches, type WallCoverage } from './register-wall-stretches'
import { overlappingBounds } from './overlapping-endpoints'
import { onOneLine } from '../geometry/tolerance'
import { dot, leftPerp, negate, shift, subtract } from '../geometry/vector'
import type { Point, Wall } from '../model/types'

export interface WallPart {
  readonly start: Point
  readonly end: Point
}

export function uncoveredParts(existing: readonly Wall[], drawn: WallPart): WallPart[] {
  return uncoveredPartsOf(registerWallStretches(existing).coverage, drawn)
}

interface CoveredInterval extends WallPart {
  /** The authored bounds, in draw order. */
  readonly source: WallPart
}

/** Clip against the two planes perpendicular to the authored wall at its endpoints. */
function clipToWallBounds(drawn: WallPart, wall: WallPart): CoveredInterval {
  const wallDirection = subtract(wall.end, wall.start)
  const drawDirection = subtract(drawn.end, drawn.start)
  const forward = dot(wallDirection, drawDirection) > 0

  const startFirst = drawDirection.x > 0 || (drawDirection.x === 0 && drawDirection.y > 0)
  const queryOrigin = startFirst ? drawn.start : drawn.end
  const queryNormal = leftPerp(startFirst ? drawDirection : negate(drawDirection))
  const tangent = leftPerp(wallDirection)
  const scale = Math.abs(tangent.x) > Math.abs(tangent.y) ? tangent.x : tangent.y
  const planeTangent = { x: tangent.x / scale, y: tangent.y / scale }

  function cut(endpoint: Point, boundary: Point, inward: Point): Point {
    if (dot(subtract(endpoint, boundary), inward) >= 0) return endpoint
    // Adjacent walls meet the draw at the same point on their shared end plane.
    const offset = dot(subtract(queryOrigin, boundary), queryNormal)
    if (offset === 0) return boundary
    return shift(boundary, planeTangent, offset / dot(planeTangent, queryNormal))
  }

  const alongDraw = forward ? wallDirection : negate(wallDirection)
  return {
    start: cut(drawn.start, forward ? wall.start : wall.end, alongDraw),
    end: cut(drawn.end, forward ? wall.end : wall.start, negate(alongDraw)),
    source: forward ? wall : { start: wall.end, end: wall.start },
  }
}

function endpointKey({ x, y }: Point): string {
  return `${x}:${y}`
}

/** Include each continuing pair's interior junction before unrelated intervals join the union. */
function joinInteriorJunctions(
  intervals: readonly CoveredInterval[],
  compare: (a: Point, b: Point) => number,
  tolerance: number,
): WallPart[] {
  const endingAt = new Map<string, CoveredInterval[]>()
  for (const interval of intervals) {
    const key = endpointKey(interval.source.end)
    const incident = endingAt.get(key) ?? []
    incident.push(interval)
    endingAt.set(key, incident)
  }
  return intervals.map((interval) => {
    let start = interval.start
    const right = interval.source
    for (const neighbor of endingAt.get(endpointKey(right.start)) ?? []) {
      const left = neighbor.source
      if (
        compare(neighbor.end, start) < 0 &&
        dot(subtract(left.end, left.start), subtract(right.end, right.start)) > 0 &&
        onOneLine(left.start, left.end, right.start, right.end, tolerance)
      )
        start = neighbor.end
    }
    return { start, end: interval.end }
  })
}

export function uncoveredPartsOf(coverage: WallCoverage, drawn: WallPart): WallPart[] {
  return findDrawnWallCoverage(coverage, drawn).parts
}

function findDrawnWallCoverage(
  { owners, tolerance }: WallCoverage,
  drawn: WallPart,
): { parts: WallPart[]; hasCoverage: boolean } {
  const direction = subtract(drawn.end, drawn.start)
  const compare = (a: Point, b: Point): number => dot(subtract(a, b), direction)
  const covered: CoveredInterval[] = []
  for (const wall of owners) {
    if (!onOneLine(drawn.start, drawn.end, wall.start, wall.end, tolerance)) continue
    if (overlappingBounds(drawn, wall.bounds, tolerance))
      covered.push(clipToWallBounds(drawn, wall.bounds))
  }
  if (covered.length === 0) return { parts: [drawn], hasCoverage: false }

  const parts: WallPart[] = []
  let coveredEnd = drawn.start
  const joined = joinInteriorJunctions(covered, compare, tolerance)
  for (const interval of joined.sort((left, right) => compare(left.start, right.start))) {
    if (compare(interval.start, coveredEnd) > 0) {
      parts.push({ start: coveredEnd, end: interval.start })
    }
    if (compare(interval.end, coveredEnd) > 0) coveredEnd = interval.end
  }
  if (compare(drawn.end, coveredEnd) > 0) parts.push({ start: coveredEnd, end: drawn.end })
  return {
    parts: parts.filter(({ start, end }) => start.x !== end.x || start.y !== end.y),
    hasCoverage: true,
  }
}

export function drawnWallNote(existing: readonly Wall[], drawn: WallPart): string | undefined {
  const { coverage } = registerWallStretches(existing)
  const { parts, hasCoverage } = findDrawnWallCoverage(coverage, drawn)
  if (!hasCoverage) return undefined
  if (parts.length === 0) return 'This wall was already there.'
  return 'Part of this wall was already there.'
}
