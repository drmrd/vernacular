import { effectiveWallThickness, rawWallId, type Point, type WallSceneNode } from '../../core'

/** One half, as a multiplier on a wall's effective assembly thickness to reach a face from its centerline. */
const HALF = 0.5

/**
 * The wall face a plan pointer points at: the raw wall id (no `wall:` prefix) plus
 * which paintable side faces the pointer. `left`/`right` match the model and the
 * offset bands in draw-surface-paint, so the inspector A/B chips line up.
 */
export interface WallFaceHit {
  wallId: string
  side: 'left' | 'right'
}

interface FaceProjection {
  /** Perpendicular distance from the wall centerline (signed: positive is the left side). */
  signed: number
  /** Position along the segment, clamped to [0, 1]; <0 or >1 means past an endpoint. */
  along: number
}

/**
 * Project `point` onto the wall's local frame: the perpendicular (signed, so the
 * sign names the face) and the along-axis fraction. A degenerate (zero-length)
 * wall has no direction, so it reports a fraction outside [0, 1] to skip it.
 */
function projectOntoWall(point: Point, wall: WallSceneNode): FaceProjection {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return { signed: Infinity, along: -1 }
  }
  const length = Math.sqrt(lengthSquared)
  const px = point.x - wall.start.x
  const py = point.y - wall.start.y
  // perp = (-dir.y, dir.x); a positive dot puts the point on the left face, matching offsetBand.
  const signed = (px * -dy + py * dx) / length
  const along = (px * dx + py * dy) / lengthSquared
  return { signed, along }
}

/**
 * The nearer face of the closest wall a plan pointer addresses, or null when the
 * pointer is past every wall. A pointer within `tolerance` of a face (measured from
 * the offset face line at the wall's effective assembly thickness, so ADR-0160's
 * poche does not count against the band) and between the wall's endpoints picks
 * that wall; ties resolve to the nearer face.
 */
export function hitTestWallFace(
  walls: readonly WallSceneNode[],
  point: Point,
  tolerance: number,
): WallFaceHit | null {
  let best: WallFaceHit | null = null
  // Seeded with the tolerance so the same `<=` test both bounds the band and tracks the winner.
  let bestDistance = tolerance
  for (const wall of walls) {
    const { signed, along } = projectOntoWall(point, wall)
    if (along < 0 || along > 1) {
      continue
    }
    const side = signed >= 0 ? 'left' : 'right'
    const faceDistance = Math.abs(Math.abs(signed) - effectiveWallThickness(wall) * HALF)
    if (faceDistance <= bestDistance) {
      bestDistance = faceDistance
      best = { wallId: rawWallId(wall), side }
    }
  }
  return best
}
