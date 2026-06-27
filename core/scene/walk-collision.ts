/**
 * A point in the world horizontal plane (X, Z), in millimeters. Walk collision
 * runs entirely in this plane: the walker stands on the floor at a fixed eye
 * height, so only the horizontal axes can move into a wall.
 */
export interface PlanarPoint {
  x: number
  z: number
}

/** A wall as a collision segment in the world horizontal plane (X, Z). */
export interface WallSegment {
  start: PlanarPoint
  end: PlanarPoint
}

// Below this separation the push-out direction is taken from the wall's own
// normal rather than the (degenerate) vector from the wall to the walker.
const CONTACT_EPSILON_MM = 1e-6

/** The point on a finite segment nearest the given point, clamped to its ends. */
function closestPointOnSegment(point: PlanarPoint, segment: WallSegment): PlanarPoint {
  const spanX = segment.end.x - segment.start.x
  const spanZ = segment.end.z - segment.start.z
  const lengthSquared = spanX * spanX + spanZ * spanZ
  if (lengthSquared === 0) {
    return { x: segment.start.x, z: segment.start.z }
  }
  const projection =
    ((point.x - segment.start.x) * spanX + (point.z - segment.start.z) * spanZ) / lengthSquared
  const clamped = Math.max(0, Math.min(1, projection))
  return { x: segment.start.x + clamped * spanX, z: segment.start.z + clamped * spanZ }
}

/** The wall's unit normal in the horizontal plane, used when the walker is on it. */
function segmentNormal(segment: WallSegment): PlanarPoint {
  const spanX = segment.end.x - segment.start.x
  const spanZ = segment.end.z - segment.start.z
  const length = Math.hypot(spanX, spanZ)
  if (length === 0) {
    return { x: 1, z: 0 }
  }
  return { x: -spanZ / length, z: spanX / length }
}

/**
 * Pushes a single point out of one wall segment. If the point is within `radius`
 * of the segment it is moved to exactly `radius` away along the outward direction;
 * the along-wall component is left untouched, so a glancing move slides instead of
 * stopping. A point already clear of the wall is returned unchanged.
 */
function pushOutOfSegment(point: PlanarPoint, segment: WallSegment, radius: number): PlanarPoint {
  const closest = closestPointOnSegment(point, segment)
  const outX = point.x - closest.x
  const outZ = point.z - closest.z
  const distance = Math.hypot(outX, outZ)
  if (distance >= radius) {
    return point
  }
  const direction =
    distance > CONTACT_EPSILON_MM
      ? { x: outX / distance, z: outZ / distance }
      : segmentNormal(segment)
  return { x: closest.x + direction.x * radius, z: closest.z + direction.z * radius }
}

/**
 * Resolves a proposed walker position against every wall segment, modeling the
 * walker as a circle of the given radius (a capsule seen from above). Each
 * penetrating segment pushes the position out to the radius along that wall's
 * normal, which clamps a head-on move and lets an angled move slide along the
 * wall. Segments are resolved in sequence so a later wall corrects a position an
 * earlier wall left inside it.
 */
export function resolveWalkCollision(
  position: PlanarPoint,
  segments: readonly WallSegment[],
  radius: number,
): PlanarPoint {
  let resolved = position
  for (const segment of segments) {
    resolved = pushOutOfSegment(resolved, segment, radius)
  }
  return resolved
}
