import * as THREE from 'three'
import type { Triangle } from './geometry-utils'

/** Clip the tessellated void to the inside half-plane at one end of the wall run. */
export function clipAtRunEnd(loop: THREE.Vector2[], end: number): THREE.Vector2[] {
  const clipped: THREE.Vector2[] = []
  for (const [index, to] of loop.entries()) {
    const from = loop[(index + loop.length - 1) % loop.length]!
    if ((from.x < end && to.x > end) || (from.x > end && to.x < end)) {
      const fraction = (end - from.x) / (to.x - from.x)
      clipped.push(new THREE.Vector2(end, from.y + fraction * (to.y - from.y)))
    }
    if (end === 0 ? to.x >= end : to.x <= end) clipped.push(to)
  }
  return clipped
}

type Segment = [THREE.Vector2, THREE.Vector2]

/** Only the outer boundary of a triangulated face can have triangle sides on a run end. */
export function standingEndSegments(
  outline: { points: THREE.Vector2[]; triangles: Triangle[]; clippedEnds: Set<number> },
  end: Segment,
): Segment[] {
  const along = end[0].x
  if (!outline.clippedEnds.has(along)) return [end]
  const segments: Segment[] = []
  for (const triangle of outline.triangles) {
    for (const [index, vertex] of triangle.entries()) {
      const from = outline.points[vertex]!
      const to = outline.points[triangle[(index + 1) % triangle.length]!]!
      if (from.x === along && to.x === along) segments.push([from, to])
    }
  }
  return segments
}
