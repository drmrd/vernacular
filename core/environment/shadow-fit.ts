import { centerAndDiagonal } from '../scene/camera-framing'
import type { Bounds3, Vector3 } from '../scene/vector3'

/**
 * What the shadow fit covers. Every coordinate is millimetres in the world
 * frame of the scene: right-handed, Y up, the ground plane at `ground.min.y`.
 */
export interface ShadowFitInput {
  /** The box around everything that casts a shadow. */
  casters: Bounds3
  /**
   * The ground plane's extent (`min.y` equals `max.y`), or null when there is
   * no ground. A ground box with a number that is not finite counts as no
   * ground.
   */
  ground: Bounds3 | null
  /**
   * Unit vector from the scene toward the sun. A direction with a component
   * that is not finite gives a copy of the casters.
   */
  sunDirection: Vector3
  /**
   * The cap on the radius of the fitted sphere, in millimetres. `NaN` gives a
   * copy of the casters; `Infinity` means no cap.
   */
  maxRadius: number
}

/**
 * The smallest sun height (the y of the unit sun direction) the projection
 * uses. A lower or negative sun projects as if it stood at this height, so the
 * fit stays finite and changes continuously through the horizon.
 */
const MIN_PROJECTION_SUN_HEIGHT = 1e-6

/**
 * The largest size of one shadow map texel on the ground, in millimetres, that
 * the fit may reach before the far end of the shadow gives way. The cap on the
 * fit's radius is this value times the shadow map size divided by 2; the engine
 * supplies the map size.
 *
 * Derivation: the texel size that keeps the whole lawn shadow of the reference
 * project at the winter-afternoon sun (-0.7980, 0.0911, 0.5957) is 15.41 mm,
 * rounded up to the next half millimetre. The casters alone need 12.39 mm. The
 * reference bounds run from (-57, -250, -10057) to (20057, 11438, 57) mm, and
 * its ground extent from (-5057, 0, -15057) to (25057, 0, 5057) mm. Measured on
 * 2026-11-15.
 *
 * The test tests/performance/shadow-fit-reach.test.ts holds the derivation, so a
 * change of the reference project that moves the needed size fails that test.
 */
export const MAX_SHADOW_TEXEL_MM = 15.5

const DIAGONAL_TO_RADIUS = 0.5
const QUADRATIC_FOUR = 4

/**
 * Half the diagonal of a box, in millimetres: the radius the engine fits its
 * shadow camera to.
 */
export function boundsRadius(bounds: Bounds3): number {
  return DIAGONAL_TO_RADIUS * centerAndDiagonal(bounds).diagonal
}

/**
 * The box that covers the casters and their shadow on the ground, clipped to
 * the ground's extent and to the cap on the radius. All values are millimetres
 * in the world frame (Y up).
 *
 * Each caster corner above the ground plane is projected along the sun ray
 * onto the plane and clamped to the ground rectangle on each axis. Corners at
 * or below the plane cast nothing. One rule holds for every sun height: the
 * sun height is clamped from below at the smallest height the projection uses,
 * so a low sun with a horizontal component sends the point to the edge of the
 * ground on the side away from the sun, a zero component keeps the corner's
 * coordinate, and a sun below the horizon gets the horizon's fit. Input with
 * no usable shadow gives a copy of the casters; the fields of `ShadowFitInput`
 * state the cases.
 *
 * When the radius of that box exceeds `maxRadius`, the box shrinks linearly
 * toward the caster box until its radius equals the cap, so the far end of the
 * shadow gives way first. The casters are never cut: when their own radius is
 * at or above the cap, the fit is the casters alone.
 */
export function shadowFitBounds(input: ShadowFitInput): Bounds3 {
  if (!hasUsableShadow(input)) return copyBounds(input.casters)
  const { casters, ground, sunDirection, maxRadius } = input
  const withShadow = unionOf(casters, shadowPoints(casters, ground, sunDirection))
  return shrinkTowardCasters(casters, withShadow, maxRadius)
}

type ShadowFitInputWithGround = ShadowFitInput & { ground: Bounds3 }

/** False for no ground, a ground box or a sun direction that is not finite, or a cap of `NaN`. */
function hasUsableShadow(input: ShadowFitInput): input is ShadowFitInputWithGround {
  const { ground, sunDirection, maxRadius } = input
  return (
    ground !== null &&
    isFiniteBounds(ground) &&
    isFiniteVector(sunDirection) &&
    !Number.isNaN(maxRadius)
  )
}

function isFiniteBounds(bounds: Bounds3): boolean {
  return isFiniteVector(bounds.min) && isFiniteVector(bounds.max)
}

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
}

function shadowPoints(casters: Bounds3, ground: Bounds3, sunDirection: Vector3): Vector3[] {
  const groundHeight = ground.min.y
  return corners(casters)
    .filter((corner) => corner.y > groundHeight)
    .map((corner) => projectOntoGround(corner, ground, sunDirection))
}

function projectOntoGround(corner: Vector3, ground: Bounds3, sunDirection: Vector3): Vector3 {
  const height = corner.y - ground.min.y
  const sun: CornerAndSunHeights = { height, sunHeight: sunDirection.y }
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
interface CornerAndSunHeights {
  height: number
  sunHeight: number
}

function shadowCoordinate(axis: AxisProjection, sun: CornerAndSunHeights): number {
  const { coordinate, sunComponent, low, high } = axis
  const projected =
    coordinate - (sunComponent / Math.max(sun.sunHeight, MIN_PROJECTION_SUN_HEIGHT)) * sun.height
  return Math.min(high, Math.max(low, projected))
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
  const growth = subtract(diagonal(full), base)
  const quadratic = dot(growth, growth)
  const linear = 2 * dot(base, growth)
  const target = maxRadius / DIAGONAL_TO_RADIUS
  const constant = dot(base, base) - target * target
  const discriminant = linear * linear - QUADRATIC_FOUR * quadratic * constant
  const root = (-linear + Math.sqrt(discriminant)) / (2 * quadratic)
  return Math.min(1, Math.max(0, root))
}

function diagonal(bounds: Bounds3): Vector3 {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
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

function unionOf(start: Bounds3, points: Vector3[]): Bounds3 {
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
    copyBounds(start),
  )
}

function copyBounds(bounds: Bounds3): Bounds3 {
  return { min: { ...bounds.min }, max: { ...bounds.max } }
}
