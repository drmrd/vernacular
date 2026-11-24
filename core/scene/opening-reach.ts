import { REACH_RAY_PARALLEL_LIMIT } from '../geometry/tolerance'
import { openingTypeHasFill } from '../registries/opening-kind'
import {
  meetingRailTopMm,
  openingMotion,
  openingParts,
  type HingeMotion,
  type OpeningMotion,
  type OpeningPartId,
  type SlideMotion,
} from './opening-motion'
import type { OpeningPose } from './opening-pose'
import { planToWorld } from './plan-to-world'
import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

/** How far the walker can reach to use an opening, in millimeters (about arm plus lean). */
export const DEFAULT_INTERACT_REACH_MM = 1500

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

/** A short look ray from the eye along a unit direction, in the frame of the opening's own floor. */
interface ReachRay {
  origin: Vector3
  direction: Vector3
}

/**
 * The opening's rectangle in the frame of its own floor (plan position, height above that
 * floor's datum): its center and the three local axes.
 */
interface OpeningFrame {
  center: Vector3
  along: Vector3
  up: Vector3
  normal: Vector3
}

function shutFrame(node: OpeningSceneNode): OpeningFrame {
  return {
    center: planToWorld(node.center, node.sillHeight + node.height / 2),
    // Plan north (+y) maps to world -Z, so the along and normal Z terms negate
    // plan y. `0 - ...` rather than negation keeps an axis-aligned wall's Z a clean +0.
    along: normalize({ x: node.along.x, y: 0, z: 0 - node.along.y }),
    up: { x: 0, y: 1, z: 0 },
    normal: normalize({ x: node.normal.x, y: 0, z: 0 - node.normal.y }),
  }
}

/** The leaf rectangle moved to where its motion leaves it at the given openness. */
function openedFrame(shut: OpeningFrame, motion: OpeningMotion, openness: number): OpeningFrame {
  switch (motion.kind) {
    case 'hinge':
      return swungFrame(shut, motion, openness)
    case 'slide':
      return slidesInsideFrame(motion)
        ? shut
        : { ...shut, center: add(shut.center, scale(motion.travel, openness)) }
    default:
      return shut
  }
}

/**
 * Whether the slide moves a sash inside a frame that stays put, as a hung window's sash
 * does. The risen sash of such a window is not tested as a separate rectangle, so looking
 * anywhere in the frame of an open hung window reaches it, and the wall above the head is
 * never reached. A slide along the wall instead carries the leaf out of the opening, so the reach
 * also follows the moved leaf.
 */
function slidesInsideFrame(motion: SlideMotion): boolean {
  return motion.axis === 'vertical'
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

/** How far the walker can reach and the opening's pose. */
interface ReachLimit {
  reachMm: number
  pose: OpeningPose | undefined
}

/** The rectangle's size and how far the walker can reach, in millimeters. */
interface ReachExtent {
  width: number
  height: number
  reachMm: number
}

/** Where a ray meets one rectangle: the distance along it and the height above the rectangle's bottom edge. */
interface FrameHit {
  distance: number
  heightMm: number
}

/**
 * Where the ray from the eye meets one rectangle of the opening, or null when the ray
 * runs parallel to it, points away from it, lands beyond reach, or crosses the
 * rectangle's plane outside it. The ray direction must be a unit vector, so the
 * distance is in millimeters along the ray and the height in millimeters up from the
 * rectangle's bottom edge.
 */
function hitOnFrame(ray: ReachRay, frame: OpeningFrame, extent: ReachExtent): FrameHit | null {
  const denom = dot(ray.direction, frame.normal)
  if (Math.abs(denom) < REACH_RAY_PARALLEL_LIMIT) return null
  const t = dot(subtract(frame.center, ray.origin), frame.normal) / denom
  if (t <= 0 || t > extent.reachMm) return null
  const hit = add(ray.origin, scale(ray.direction, t))
  const local = subtract(hit, frame.center)
  if (Math.abs(dot(local, frame.along)) > extent.width / 2) return null
  const upOffset = dot(local, frame.up)
  if (Math.abs(upOffset) > extent.height / 2) return null
  return { distance: t, heightMm: upOffset + extent.height / 2 }
}

/**
 * The nearer hit on the opening's shut frame and, once it is open, on its moved leaf, or
 * null when the ray reaches neither. The shut frame counts at every openness, so an open
 * door is still found from where it was opened. The openness is that of the part the
 * opening's motion drives, which is the leaf whose moved rectangle is tested, not the part
 * that E acts on (that part comes from `reachHit`).
 */
function nearestReachHit(
  ray: ReachRay,
  node: OpeningSceneNode,
  limit: ReachLimit,
): FrameHit | null {
  const shut = shutFrame(node)
  const motion = openingMotion(node.type, node)
  const openness = motion.kind === 'none' ? 0 : (limit.pose?.[motion.partId] ?? 0)
  const frames = openness > 0 ? [shut, openedFrame(shut, motion, openness)] : [shut]
  const extent: ReachExtent = { width: node.width, height: node.height, reachMm: limit.reachMm }
  const hits = frames
    .map((frame) => hitOnFrame(ray, frame, extent))
    .filter((hit): hit is FrameHit => hit !== null)
  return hits.length === 0
    ? null
    : hits.reduce((nearest, hit) => (hit.distance < nearest.distance ? hit : nearest))
}

/** The band of an opening's shut frame, in millimeters up from the frame's bottom. */
export interface OpeningBand {
  readonly bottomMm: number
  readonly topMm: number
}

/** The opening the walker looks at and the part of it that E acts on. */
export interface OpeningReachHit {
  readonly openingId: string
  readonly part: OpeningPartId
  /** The band of the shut frame that the part answers for, in millimeters up from the frame's bottom. */
  readonly band: OpeningBand
}

function reachHit(node: OpeningSceneNode, heightMm: number): OpeningReachHit {
  return { openingId: node.id, ...partAt(node, heightMm) }
}

function partAt(
  node: OpeningSceneNode,
  heightMm: number,
): { part: OpeningPartId; band: OpeningBand } {
  const parts = openingParts(node.type)
  if (!parts.includes('upper') || !parts.includes('lower')) {
    return { part: parts[0] ?? 'primary', band: { bottomMm: 0, topMm: node.height } }
  }
  const railTopMm = meetingRailTopMm(node.height)
  return heightMm > railTopMm
    ? { part: 'upper', band: { bottomMm: railTopMm, topMm: node.height } }
    : { part: 'lower', band: { bottomMm: 0, topMm: railTopMm } }
}

interface NearestOpening {
  node: OpeningSceneNode
  hit: FrameHit
}

function nearerOf(
  nearest: NearestOpening | null,
  node: OpeningSceneNode,
  hit: FrameHit | null,
): NearestOpening | null {
  return hit !== null && hit.distance < (nearest?.hit.distance ?? Infinity)
    ? { node, hit }
    : nearest
}

/**
 * The opening the walker looks at within reach and its part, or null when none is in
 * view. A short ray runs from the eye along the look direction; each opening is
 * tested as its shut frame and, once open, the rectangle its leaf or sash fills (spec
 * section 3.2), and the
 * nearest one the ray crosses within `reachMm` wins. The direction need not be
 * normalized; it is normalized here so the reach is measured in millimeters. Every
 * opening keeps its shut rectangle at every openness, and an open one also counts where
 * its leaf has moved to (see `slidesInsideFrame`). The eye is in the frame of the
 * openings' own floor, with its height above that floor's datum.
 */
// eslint-disable-next-line max-params -- the eye and the look direction are independent ray inputs, the openings are the world being tested, and the options bundle the per-opening openness and the reach limit; none collapse into another.
export function openingUnderReach(
  eye: Vector3,
  direction: Vector3,
  openings: readonly OpeningSceneNode[],
  options?: { openness?: ReadonlyMap<string, OpeningPose>; reachMm?: number },
): OpeningReachHit | null {
  const reachMm = options?.reachMm ?? DEFAULT_INTERACT_REACH_MM
  const ray: ReachRay = { origin: eye, direction: normalize(direction) }
  let nearest: NearestOpening | null = null
  for (const node of openings) {
    if (!openingTypeHasFill(node.type)) continue
    const hit = nearestReachHit(ray, node, { reachMm, pose: options?.openness?.get(node.id) })
    nearest = nearerOf(nearest, node, hit)
  }
  return nearest && reachHit(nearest.node, nearest.hit.heightMm)
}
