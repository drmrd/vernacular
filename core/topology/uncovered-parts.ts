import { registerWallStretches, type WallCoverage } from './register-wall-stretches'
import { overlappingBounds, projectOntoLine } from './overlapping-endpoints'
import { onOneLine } from '../geometry/tolerance'
import { dot, subtract } from '../geometry/vector'
import type { Point, Wall } from '../model/types'

export interface WallPart {
  readonly start: Point
  readonly end: Point
}

export function uncoveredParts(existing: readonly Wall[], drawn: WallPart): WallPart[] {
  return uncoveredPartsOf(registerWallStretches(existing).coverage, drawn)
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
    const overlap = overlappingBounds(drawn, wall.bounds, tolerance)
    if (overlap) covered.push(overlap)
  }
  if (covered.length === 0) return { parts: [drawn], hasCoverage: false }

  const parts: WallPart[] = []
  let coveredEnd = drawn.start
  for (const interval of covered.sort((left, right) => compare(left.start, right.start))) {
    if (compare(interval.start, coveredEnd) > 0) {
      parts.push({
        start: projectOntoLine(coveredEnd, drawn),
        end: projectOntoLine(interval.start, drawn),
      })
    }
    if (compare(interval.end, coveredEnd) > 0) coveredEnd = interval.end
  }
  if (compare(drawn.end, coveredEnd) > 0)
    parts.push({ start: projectOntoLine(coveredEnd, drawn), end: drawn.end })
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
