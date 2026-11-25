import { exposedWallStretches } from './node-wall-overlaps'
import { overlappingEndpoints, projectOntoLine } from './overlapping-endpoints'
import { dot, subtract } from '../geometry/vector'
import type { Point, Wall } from '../model/types'

export interface WallPart {
  readonly start: Point
  readonly end: Point
}

export function uncoveredParts(existing: readonly Wall[], drawn: WallPart): WallPart[] {
  return findDrawnWallCoverage(existing, drawn).parts
}

function findDrawnWallCoverage(
  existing: readonly Wall[],
  drawn: WallPart,
): { parts: WallPart[]; hasCoverage: boolean } {
  const direction = subtract(drawn.end, drawn.start)
  const compare = (a: Point, b: Point): number => dot(subtract(a, b), direction)
  const covered: WallPart[] = []
  for (const wall of exposedWallStretches(existing)) {
    const overlap = overlappingEndpoints(drawn, wall)
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
  const { parts, hasCoverage } = findDrawnWallCoverage(existing, drawn)
  if (!hasCoverage) return undefined
  if (parts.length === 0) return 'This wall was already there.'
  return 'Part of this wall was already there.'
}
