import { DERIVATION_LENGTH_TOLERANCE_MM, onOneLine, pointsCoincide } from '../geometry/tolerance'
import { dot, shift, subtract, unit } from '../geometry/vector'
import type { Point, Wall } from '../model/types'

export interface WallPart {
  readonly start: Point
  readonly end: Point
}

interface CoveredInterval {
  readonly start: number
  readonly end: number
}

export function uncoveredParts(existing: readonly Wall[], drawn: WallPart): WallPart[] {
  return findDrawnWallCoverage(existing, drawn).parts
}

function findDrawnWallCoverage(
  existing: readonly Wall[],
  drawn: WallPart,
): { parts: WallPart[]; hasCoverage: boolean } {
  if (pointsCoincide(drawn.start, drawn.end)) return { parts: [drawn], hasCoverage: false }
  const direction = subtract(drawn.end, drawn.start)
  const squaredLength = dot(direction, direction)
  const project = (point: Point): number => dot(subtract(point, drawn.start), direction)
  const length = Math.sqrt(squaredLength)
  const minimumOverlap = DERIVATION_LENGTH_TOLERANCE_MM * length

  const covered: CoveredInterval[] = []
  for (const wall of existing) {
    if (!onOneLine(drawn.start, drawn.end, wall.start, wall.end)) continue
    const first = project(wall.start)
    const second = project(wall.end)
    const start = Math.max(0, Math.min(first, second))
    const end = Math.min(squaredLength, Math.max(first, second))
    if (end - start > minimumOverlap) covered.push({ start, end })
  }
  if (covered.length === 0) return { parts: [drawn], hasCoverage: false }

  const tangent = unit(direction)
  const pointAt = (projection: number): Point =>
    projection === 0 ? drawn.start : shift(drawn.start, tangent, projection / length)
  const parts: WallPart[] = []
  let coveredEnd = 0
  for (const interval of covered.sort((left, right) => left.start - right.start)) {
    if (interval.start > coveredEnd) {
      parts.push({ start: pointAt(coveredEnd), end: pointAt(interval.start) })
    }
    coveredEnd = Math.max(coveredEnd, interval.end)
  }
  if (coveredEnd < squaredLength) parts.push({ start: pointAt(coveredEnd), end: drawn.end })
  return { parts, hasCoverage: true }
}

export function drawnWallNote(existing: readonly Wall[], drawn: WallPart): string | undefined {
  const { parts, hasCoverage } = findDrawnWallCoverage(existing, drawn)
  if (!hasCoverage) return undefined
  if (parts.length === 0) return 'This wall was already there.'
  return 'Part of this wall was already there.'
}
