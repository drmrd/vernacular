import { distance } from '../geometry/point'
import { DERIVATION_LENGTH_TOLERANCE_MM, onOneLine } from '../geometry/tolerance'
import { dot, subtract } from '../geometry/vector'
import type { WallPart } from './uncovered-parts'

/** The two source endpoints bounding the overlap, in the first segment's direction. */
export function overlappingEndpoints(
  first: WallPart,
  second: WallPart,
  tolerance = DERIVATION_LENGTH_TOLERANCE_MM,
): WallPart | undefined {
  if (!onOneLine(first.start, first.end, second.start, second.end, tolerance)) return undefined
  const direction = subtract(first.end, first.start)
  const forward = dot(subtract(second.end, second.start), direction) >= 0
  const lower = forward ? second.start : second.end
  const upper = forward ? second.end : second.start
  const start = dot(subtract(lower, first.start), direction) > 0 ? lower : first.start
  const end = dot(subtract(upper, first.end), direction) < 0 ? upper : first.end
  const span = dot(subtract(end, start), direction)
  return span > tolerance * distance(first.start, first.end) ? { start, end } : undefined
}
