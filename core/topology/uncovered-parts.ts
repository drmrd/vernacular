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

/** Clip against the two planes perpendicular to the authored wall at its endpoints. */
function clipToWallBounds(drawn: WallPart, wall: WallPart): WallPart {
  const wallDirection = subtract(wall.end, wall.start)
  const drawDirection = subtract(drawn.end, drawn.start)
  const forward = dot(wallDirection, drawDirection) > 0

  function cut(query: WallPart, boundary: Point, inward: Point): Point {
    const from = dot(subtract(query.start, boundary), inward)
    if (from >= 0) return query.start
    const to = dot(subtract(query.end, boundary), inward)
    const nearStart = -from <= to
    const near = nearStart ? query.start : query.end
    const far = nearStart ? query.end : query.start
    if (dot(subtract(boundary, near), leftPerp(drawDirection)) === 0) return boundary
    // Interpolating from the nearer end keeps even a one-ULP gap at that end.
    return shift(near, subtract(far, near), (nearStart ? from : -to) / (from - to))
  }

  const alongDraw = forward ? wallDirection : negate(wallDirection)
  return {
    start: cut(drawn, forward ? wall.start : wall.end, alongDraw),
    end: cut(
      { start: drawn.end, end: drawn.start },
      forward ? wall.end : wall.start,
      negate(alongDraw),
    ),
  }
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
  const covered: WallPart[] = []
  for (const wall of owners) {
    if (!onOneLine(drawn.start, drawn.end, wall.start, wall.end, tolerance)) continue
    if (overlappingBounds(drawn, wall.bounds, tolerance))
      covered.push(clipToWallBounds(drawn, wall.bounds))
  }
  if (covered.length === 0) return { parts: [drawn], hasCoverage: false }

  const parts: WallPart[] = []
  let coveredEnd = drawn.start
  for (const interval of covered.sort((left, right) => compare(left.start, right.start))) {
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
