import * as THREE from 'three'

import {
  openingMotion,
  openingPartMotion,
  openingParts,
  type HingeMotion,
  type HungSash,
  type OpeningMotion,
  type OpeningPartId,
  type OpeningPose,
  type OpeningSceneNode,
  type SlideMotion,
} from '../../core'
import { openingFillSashOf } from './opening-fill-builder'

/**
 * Transforms an opening fill group (from buildOpeningFill) to play the resolved OpeningMotion
 * at the given openness, where 0 is shut and 1 is fully open.
 * - A hinge, or a slide whose partId is 'primary', transforms the whole group.
 * - A slide whose partId names a hung-window sash leaves the group at its built transform and
 *   translates only the child meshes stamped with that sash (see openingFillSashOf) by
 *   travel * openness. Every other child mesh is left as it is.
 * At openness 0 the moving part sits at its built transform (zero translation, identity
 * rotation), so an opening with every part shut renders exactly as it was built.
 */
export function applyOpeningMotion(
  group: THREE.Object3D,
  motion: OpeningMotion,
  openness: number,
): void {
  switch (motion.kind) {
    case 'hinge':
      applyHinge(group, motion, openness)
      break
    case 'slide':
      applySlide(group, motion, openness)
      break
    case 'none':
      // A fixed opening has no moving part, so it keeps the transform it was built with.
      break
    default: {
      const unreachable: never = motion
      return unreachable
    }
  }
}

/**
 * Resolves the motion for the opening node and plays it on the node's fill group
 * within `root`. The group is located by its name (the opening id that
 * {@link buildOpeningFill} stamps on it); a node with no built group is ignored,
 * so the runtime can drive every opening on the floor without a guard of its own.
 */
export function applyOpeningMotionForNode(
  root: THREE.Object3D,
  node: OpeningSceneNode,
  openness: number,
): void {
  const group = root.getObjectByName(node.id)
  if (group) {
    applyOpeningMotion(group, openingMotion(node.type, node), openness)
  }
}

/**
 * Plays every part of the opening node's type at its openness in the pose, on the node's fill
 * group within `root`; a part missing from the pose is shut. Each hung-window sash moves only
 * its own meshes, so one sash never resets the other. A node with no built group is ignored.
 */
export function applyOpeningPose(
  root: THREE.Object3D,
  node: OpeningSceneNode,
  pose: OpeningPose,
): void {
  const group = root.getObjectByName(node.id)
  if (!group) {
    return
  }
  for (const part of openingParts(node.type)) {
    applyOpeningMotion(group, openingPartMotion(node.type, node, part), pose[part] ?? 0)
  }
}

/**
 * Translates the moving part along the motion's travel vector, scaled by openness: the whole
 * group for the 'primary' part, or only the meshes of the named sash for a hung window.
 */
function applySlide(group: THREE.Object3D, motion: SlideMotion, openness: number): void {
  if (isSashPart(motion.partId)) {
    slideSash(group, motion, openness)
    return
  }
  group.quaternion.identity()
  translateAlong(group, motion.travel, openness)
}

/** True when the part id names one sash of a hung window rather than the whole opening. */
function isSashPart(partId: OpeningPartId): partId is HungSash {
  return partId === 'lower' || partId === 'upper'
}

/**
 * Rests the group at its built transform and translates only the meshes of the motion's sash,
 * leaving every other child where it is. This relies on how the fill builder lays a fill out: it
 * adds each part mesh flat to the group, with its vertices built in place and a mesh position of
 * zero. The meshes of a sash are therefore direct children of the group, and a position of zero
 * is the built pose. A nested child, or a child built with a position other than zero, would
 * break this.
 */
function slideSash(group: THREE.Object3D, motion: SlideMotion, openness: number): void {
  group.quaternion.identity()
  group.position.set(0, 0, 0)
  for (const child of group.children) {
    if (openingFillSashOf(child) === motion.partId) {
      translateAlong(child, motion.travel, openness)
    }
  }
}

function translateAlong(
  object: THREE.Object3D,
  travel: SlideMotion['travel'],
  openness: number,
): void {
  object.position.set(travel.x * openness, travel.y * openness, travel.z * openness)
}

/**
 * Rotates the group about the hinge edge by `openAngle * openness`, composed with
 * an offset that keeps the pivot point on the edge fixed.
 */
function applyHinge(group: THREE.Object3D, motion: HingeMotion, openness: number): void {
  const axis = new THREE.Vector3(motion.axis.x, motion.axis.y, motion.axis.z)
  const pivot = new THREE.Vector3(motion.pivot.x, motion.pivot.y, motion.pivot.z)
  group.quaternion.setFromAxisAngle(axis, motion.openAngle * openness)
  const pivoted = pivot.clone().applyQuaternion(group.quaternion)
  group.position.set(pivot.x - pivoted.x, pivot.y - pivoted.y, pivot.z - pivoted.z)
}
