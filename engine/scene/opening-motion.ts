import * as THREE from 'three'

import type { HingeMotion, OpeningMotion, SlideMotion } from '../../core'

/**
 * Transforms an opening fill group (its leaf, sash, and glass, from
 * {@link buildOpeningFill}) to play the resolved {@link OpeningMotion} at the
 * given openness, where 0 is shut and 1 is fully open. The group's box vertices
 * are baked in world space, so each motion composes its transform with a matching
 * offset that keeps the moving part anchored. At openness 0 every motion is the
 * identity, so a shut opening renders exactly as it was built.
 */
export function applyOpeningMotion(
  group: THREE.Object3D,
  motion: OpeningMotion,
  openness: number,
): void {
  if (motion.kind === 'hinge') {
    applyHinge(group, motion, openness)
  } else if (motion.kind === 'slide') {
    applySlide(group, motion, openness)
  }
}

/** Translates the group along the motion's travel vector, scaled by openness. */
function applySlide(group: THREE.Object3D, motion: SlideMotion, openness: number): void {
  group.quaternion.identity()
  group.position.set(
    motion.travel.x * openness,
    motion.travel.y * openness,
    motion.travel.z * openness,
  )
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
