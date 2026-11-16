import type { Bounds3, Vector3 } from '../scene/vector3'

/**
 * What the shadow fit covers. Every coordinate is millimetres in the world
 * frame of the scene: right-handed, Y up, the ground plane at `ground.min.y`.
 */
export interface ShadowFitInput {
  /** The box around everything that casts a shadow. */
  casters: Bounds3
  /** The ground plane's extent (`min.y` equals `max.y`), or null when there is no ground. */
  ground: Bounds3 | null
  /** Unit vector from the scene toward the sun. */
  sunDirection: Vector3
  /** The cap on the radius of the fitted sphere, in millimetres. */
  maxRadius: number
}

/** Below this sun height (the y of the unit sun direction) the sun counts as on the horizon. */
const HORIZON_SUN_HEIGHT = 1e-6

const DIAGONAL_TO_RADIUS = 0.5
const QUADRATIC_FOUR = 4
const QUADRATIC_TWO = 2

/**
 * Half the diagonal of a box, in millimetres: the radius the engine fits its
 * shadow camera to.
 */
export function boundsRadius(bounds: Bounds3): number {
  return (
    DIAGONAL_TO_RADIUS *
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    )
  )
}

/**
 * The box that covers the casters and their shadow on the ground, clipped to
 * the ground's extent and to the cap on the radius. All values are millimetres
 * in the world frame (Y up).
 *
 * Each caster corner above the ground plane is projected along the sun ray
 * onto the plane and clamped to the ground rectangle on each axis. Corners at
 * or below the plane cast nothing. With the sun at or below the horizon the
 * projected point takes the limit: the edge of the ground on the side away
 * from the sun. With no ground, the fit is the casters.
 *
 * When the radius of that box exceeds `maxRadius`, the box shrinks linearly
 * toward the caster box until its radius equals the cap, so the far end of the
 * shadow gives way first. The casters are never cut: when their own radius is
 * at or above the cap, the fit is the casters alone.
 */
export function shadowFitBounds(input: ShadowFitInput): Bounds3 {
  const { casters, ground, sunDirection, maxRadius } = input
  if (ground === null) {
    return copyBounds(casters)
  }
  const withShadow = unionOf(casters, shadowPoints(casters, ground, sunDirection))
  return shrinkTowardCasters(casters, withShadow, maxRadius)
}

function shadowPoints(casters: Bounds3, ground: Bounds3, sunDirection: Vector3): Vector3[] {
  const groundHeight = ground.min.y
  return corners(casters)
    .filter((corner) => corner.y > groundHeight)
    .map((corner) => projectOntoGround(corner, ground, sunDirection))
}

function projectOntoGround(corner: Vector3, ground: Bounds3, sunDirection: Vector3): Vector3 {
  const height = corner.y - ground.min.y
  const sun: SunReach = { height, sunHeight: sunDirection.y }
  return {
    x: shadowCoordinate(
      { coordinate: corner.x, sunComponent: sunDirection.x, low: ground.min.x, high: ground.max.x },
      sun,
    ),
    y: ground.min.y,
    z: shadowCoordinate(
      { coordinate: corner.z, sunComponent: sunDirection.z, low: ground.min.z, high: ground.max.z },
      sun,
    ),
  }
}

/** One horizontal axis of a corner, the sun's component along it, and the ground's range on it. */
interface AxisProjection {
  coordinate: number
  sunComponent: number
  low: number
  high: number
}

/** The corner's height above the ground and the sun's height (y of the unit direction). */
interface SunReach {
  height: number
  sunHeight: number
}

function shadowCoordinate(axis: AxisProjection, sun: SunReach): number {
  const { coordinate, sunComponent, low, high } = axis
  if (sun.sunHeight > HORIZON_SUN_HEIGHT) {
    const projected = coordinate - (sunComponent / sun.sunHeight) * sun.height
    return Math.min(high, Math.max(low, projected))
  }
  if (sunComponent > 0) return low
  if (sunComponent < 0) return high
  return Math.min(high, Math.max(low, coordinate))
}

function shrinkTowardCasters(casters: Bounds3, full: Bounds3, maxRadius: number): Bounds3 {
  const casterRadius = boundsRadius(casters)
  const fullRadius = boundsRadius(full)
  if (fullRadius <= maxRadius) return full
  if (casterRadius >= maxRadius) return copyBounds(casters)
  const fraction = shrinkFraction(casters, full, maxRadius)
  return {
    min: lerpVector(casters.min, full.min, fraction),
    max: lerpVector(casters.max, full.max, fraction),
  }
}

/**
 * The fraction of the way from the caster box to the full box at which the
 * radius equals the cap. The diagonal is linear in the fraction, so its
 * squared length is a quadratic whose positive root is returned.
 */
function shrinkFraction(casters: Bounds3, full: Bounds3, maxRadius: number): number {
  const base = diagonal(casters)
  const growth = diagonal(full)
  growth.x -= base.x
  growth.y -= base.y
  growth.z -= base.z
  const quadratic = dot(growth, growth)
  const linear = QUADRATIC_TWO * dot(base, growth)
  const target = maxRadius / DIAGONAL_TO_RADIUS
  const constant = dot(base, base) - target * target
  const discriminant = linear * linear - QUADRATIC_FOUR * quadratic * constant
  const root = (-linear + Math.sqrt(discriminant)) / (QUADRATIC_TWO * quadratic)
  return Math.min(1, Math.max(0, root))
}

function diagonal(bounds: Bounds3): Vector3 {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function lerpVector(from: Vector3, to: Vector3, fraction: number): Vector3 {
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  }
}

function corners(bounds: Bounds3): Vector3[] {
  const { min, max } = bounds
  return [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => ({ x, y, z }))),
  )
}

function unionOf(casters: Bounds3, points: Vector3[]): Bounds3 {
  return points.reduce<Bounds3>(
    (box, point) => ({
      min: {
        x: Math.min(box.min.x, point.x),
        y: Math.min(box.min.y, point.y),
        z: Math.min(box.min.z, point.z),
      },
      max: {
        x: Math.max(box.max.x, point.x),
        y: Math.max(box.max.y, point.y),
        z: Math.max(box.max.z, point.z),
      },
    }),
    copyBounds(casters),
  )
}

function copyBounds(bounds: Bounds3): Bounds3 {
  return { min: { ...bounds.min }, max: { ...bounds.max } }
}
