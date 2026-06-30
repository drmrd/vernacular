import { openingMotion, type HingeMotion, type OpeningMotion } from './opening-motion'
import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

/** How far the walker can reach to use an opening, in millimeters (about arm plus lean). */
export const DEFAULT_INTERACT_REACH_MM = 1500

// Below this the ray runs parallel to the opening plane and never crosses it.
const PARALLEL_EPSILON = 1e-9

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(v: Vector3, factor: number): Vector3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor }
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/** Rotate `v` about the unit `axis` by `angle` (Rodrigues' rotation formula). */
function rotateAboutAxis(v: Vector3, axis: Vector3, angle: number): Vector3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const turned = add(scale(v, cos), scale(cross(axis, v), sin))
  return add(turned, scale(axis, dot(axis, v) * (1 - cos)))
}

/** A short look ray from the eye along a unit direction, in world space. */
interface ReachRay {
  origin: Vector3
  direction: Vector3
}

/** The opening's rectangle in world space: its center and the three local axes. */
interface OpeningFrame {
  center: Vector3
  along: Vector3
  up: Vector3
  normal: Vector3
}

function openingFrame(node: OpeningSceneNode, openness: number): OpeningFrame {
  const shut: OpeningFrame = {
    center: planToWorld(node.center, node.sillHeight + node.height / 2),
    along: normalize({ x: node.along.x, y: 0, z: node.along.y }),
    up: { x: 0, y: 1, z: 0 },
    normal: normalize({ x: node.normal.x, y: 0, z: node.normal.y }),
  }
  if (openness <= 0) return shut
  return openedFrame(shut, openingMotion(node.type, node), openness)
}

/** The leaf rectangle moved to where its motion leaves it at the given openness. */
function openedFrame(shut: OpeningFrame, motion: OpeningMotion, openness: number): OpeningFrame {
  switch (motion.kind) {
    case 'hinge':
      return swungFrame(shut, motion, openness)
    case 'slide':
      return { ...shut, center: add(shut.center, scale(motion.travel, openness)) }
    default:
      return shut
  }
}

/** The frame rotated about the hinge axis through its pivot; axes rotate, not translate. */
function swungFrame(shut: OpeningFrame, motion: HingeMotion, openness: number): OpeningFrame {
  const angle = motion.openAngle * openness
  const { axis, pivot } = motion
  return {
    center: add(rotateAboutAxis(subtract(shut.center, pivot), axis, angle), pivot),
    along: rotateAboutAxis(shut.along, axis, angle),
    up: rotateAboutAxis(shut.up, axis, angle),
    normal: rotateAboutAxis(shut.normal, axis, angle),
  }
}

/**
 * The ray distance from the eye to the opening's rectangle, or null when the ray
 * runs parallel to it, points away from it, lands beyond reach, or crosses the
 * opening plane outside the leaf rectangle. The ray direction must be a unit
 * vector, so the returned distance is in millimeters.
 */
/** How far the walker can reach and how far open the leaf is swung or slid. */
interface ReachLimit {
  reachMm: number
  openness: number
}

function reachDistance(ray: ReachRay, node: OpeningSceneNode, limit: ReachLimit): number | null {
  const frame = openingFrame(node, limit.openness)
  const denom = dot(ray.direction, frame.normal)
  if (Math.abs(denom) < PARALLEL_EPSILON) return null
  const t = dot(subtract(frame.center, ray.origin), frame.normal) / denom
  if (t <= 0 || t > limit.reachMm) return null
  const hit: Vector3 = {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
    z: ray.origin.z + ray.direction.z * t,
  }
  const local = subtract(hit, frame.center)
  if (Math.abs(dot(local, frame.along)) > node.width / 2) return null
  if (Math.abs(dot(local, frame.up)) > node.height / 2) return null
  return t
}

/**
 * The id of the opening the walker looks at within reach, or null when none is in
 * view. A short ray runs from the eye along the look direction; each opening is
 * tested as the rectangle its leaf or sash fills (spec section 3.2), and the
 * nearest one the ray crosses within `reachMm` wins. The direction need not be
 * normalized; it is normalized here so the reach is measured in millimeters.
 */
// eslint-disable-next-line max-params -- the eye and the look direction are independent ray inputs, the openings are the world being tested, and the options bundle the per-opening openness and the reach limit; none collapse into another.
export function openingUnderReach(
  eye: Vector3,
  direction: Vector3,
  openings: readonly OpeningSceneNode[],
  options?: { openness?: ReadonlyMap<string, number>; reachMm?: number },
): string | null {
  const reachMm = options?.reachMm ?? DEFAULT_INTERACT_REACH_MM
  const ray: ReachRay = { origin: eye, direction: normalize(direction) }
  let nearestId: string | null = null
  let nearestDistance = Infinity
  for (const node of openings) {
    const openness = options?.openness?.get(node.id) ?? 0
    const distance = reachDistance(ray, node, { reachMm, openness })
    if (distance !== null && distance < nearestDistance) {
      nearestDistance = distance
      nearestId = node.id
    }
  }
  return nearestId
}
