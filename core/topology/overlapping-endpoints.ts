import { DERIVATION_LENGTH_TOLERANCE_MM, onOneLine } from '../geometry/tolerance'
import { dot, leftPerp, shift, subtract } from '../geometry/vector'
import type { Point } from '../model/types'
import type { WallPart } from './uncovered-parts'

/** The two source endpoints bounding the overlap, in the first segment's direction. */
export function overlappingEndpoints(
  first: WallPart,
  second: WallPart,
  tolerance = DERIVATION_LENGTH_TOLERANCE_MM,
): WallPart | undefined {
  if (!onOneLine(first.start, first.end, second.start, second.end, tolerance)) return undefined
  if (!projectedOverlap(second, first, tolerance)) return undefined
  return projectedOverlap(first, second, tolerance)
}

function projectedOverlap(
  first: WallPart,
  second: WallPart,
  tolerance: number,
): WallPart | undefined {
  const direction = subtract(first.end, first.start)
  const forward = dot(subtract(second.end, second.start), direction) >= 0
  const lower = forward ? second.start : second.end
  const upper = forward ? second.end : second.start
  const start = dot(subtract(lower, first.start), direction) > 0 ? lower : first.start
  const end = dot(subtract(upper, first.end), direction) < 0 ? upper : first.end
  const span = dot(subtract(end, start), direction)
  return span > 0 && span ** 2 > tolerance ** 2 * dot(direction, direction)
    ? { start, end }
    : undefined
}

/** Project by the perpendicular displacement, preserving coordinates along the line. */
export function projectOntoLine(point: Point, line: WallPart): Point {
  const normal = leftPerp(subtract(line.end, line.start))
  return shift(point, normal, -dot(subtract(point, line.start), normal) / dot(normal, normal))
}
