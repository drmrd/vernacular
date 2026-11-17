import * as THREE from 'three'

import {
  openingMotion,
  type HingeMotion,
  type OpeningMotion,
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
 *   travel * openness. Every other child mesh is left at zero translation.
 * At openness 0 every motion is the identity: the group and every child mesh sit at zero
 * translation and identity rotation, so a shut opening renders exactly as it was built.
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
 * Translates the moving part along the motion's travel vector, scaled by openness: the whole
 * group for the 'primary' part, or only the meshes of the named sash for a hung window.
 */
function applySlide(group: THREE.Object3D, motion: SlideMotion, openness: number): void {
  if (motion.partId === 'primary') {
    group.quaternion.identity()
    group.position.set(
      motion.travel.x * openness,
      motion.travel.y * openness,
      motion.travel.z * openness,
    )
    return
  }
  slideSash(group, motion, openness)
}

/** Rests the group at its built transform and translates only the meshes of the motion's sash. */
function slideSash(group: THREE.Object3D, motion: SlideMotion, openness: number): void {
  group.quaternion.identity()
  group.position.set(0, 0, 0)
  for (const child of group.children) {
    const scale = openingFillSashOf(child) === motion.partId ? openness : 0
    child.position.set(motion.travel.x * scale, motion.travel.y * scale, motion.travel.z * scale)
  }
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
