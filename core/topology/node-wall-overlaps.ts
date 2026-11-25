import { dot, subtract } from '../geometry/vector'
import { overlappingEndpoints, projectOntoLine } from './overlapping-endpoints'
import type { WallPart } from './uncovered-parts'

interface NodedPart extends WallPart {
  readonly covered?: boolean
}

export function nodeWallOverlaps(
  wall: WallPart,
  owners: readonly WallPart[],
  tolerance: number,
): NodedPart[] {
  let parts: NodedPart[] = [wall]
  for (const owner of owners) {
    parts = parts.flatMap((part) => {
      if (part.covered) return [part]
      const overlap = overlappingEndpoints(owner, part, tolerance)
      if (!overlap) return [part]
      const direction = subtract(owner.end, owner.start)
      const forward = dot(subtract(part.end, part.start), direction) >= 0
      const lower = forward ? overlap.start : overlap.end
      const upper = forward ? overlap.end : overlap.start
      const start = projectOntoLine(lower, owner)
      const end = projectOntoLine(upper, owner)
      const split: NodedPart[] = []
      if (dot(subtract(lower, part.start), direction) !== 0)
        split.push({ start: part.start, end: start })
      split.push({ start, end, covered: true })
      if (dot(subtract(upper, part.end), direction) !== 0) split.push({ start: end, end: part.end })
      return split
    })
  }
  return parts
}
