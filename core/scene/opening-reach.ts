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

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/** The opening's rectangle in world space: its center and the three local axes. */
interface OpeningFrame {
  center: Vector3
  along: Vector3
  up: Vector3
  normal: Vector3
}

function openingFrame(node: OpeningSceneNode): OpeningFrame {
  return {
    center: planToWorld(node.center, node.sillHeight + node.height / 2),
    along: normalize({ x: node.along.x, y: 0, z: node.along.y }),
    up: { x: 0, y: 1, z: 0 },
    normal: normalize({ x: node.normal.x, y: 0, z: node.normal.y }),
  }
}

/**
 * The ray distance from the eye to the opening's rectangle, or null when the ray
 * runs parallel to it, points away from it, lands beyond reach, or crosses the
 * opening plane outside the leaf rectangle. The direction must be a unit vector,
 * so the returned distance is in millimeters.
 */
function reachDistance(
  eye: Vector3,
  direction: Vector3,
  node: OpeningSceneNode,
  reachMm: number,
): number | null {
  const frame = openingFrame(node)
  const denom = dot(direction, frame.normal)
  if (Math.abs(denom) < PARALLEL_EPSILON) return null
  const t = dot(subtract(frame.center, eye), frame.normal) / denom
  if (t <= 0 || t > reachMm) return null
  const local = subtract(
    { x: eye.x + direction.x * t, y: eye.y + direction.y * t, z: eye.z + direction.z * t },
    frame.center,
  )
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
// eslint-disable-next-line max-params -- the eye and the look direction are independent ray inputs, the openings are the world being tested, and the reach is an environmental limit; none collapse into another.
export function openingUnderReach(
  eye: Vector3,
  direction: Vector3,
  openings: readonly OpeningSceneNode[],
  reachMm: number = DEFAULT_INTERACT_REACH_MM,
): string | null {
  const dir = normalize(direction)
  let nearestId: string | null = null
  let nearestDistance = Infinity
  for (const node of openings) {
    const distance = reachDistance(eye, dir, node, reachMm)
    if (distance !== null && distance < nearestDistance) {
      nearestDistance = distance
      nearestId = node.id
    }
  }
  return nearestId
}
