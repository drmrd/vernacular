import * as THREE from 'three'

import { planToWorld, type OpeningSceneNode } from '../../core'

// A fully open leaf swings a quarter turn from shut, which reads clearly as open
// without clipping the jamb on the far side.
const MAX_SWING_RAD = Math.PI / 2

// Openings swing about the vertical (world Y) axis, the way a door turns on its hinges.
const UP_AXIS = new THREE.Vector3(0, 1, 0)

/** The world point of the opening's hinge jamb, at the floor line below it. */
function hingePoint(node: OpeningSceneNode): THREE.Vector3 {
  const hingeSign = node.orientation.hinge === 'end' ? 1 : -1
  const half = node.width / 2
  const world = planToWorld(
    {
      x: node.center.x + hingeSign * node.along.x * half,
      y: node.center.y + hingeSign * node.along.y * half,
    },
    0,
  )
  return new THREE.Vector3(world.x, world.y, world.z)
}

/** The swing angle for an openness in [0, 1], signed by the leaf's facing. */
function swingAngle(node: OpeningSceneNode, openness: number): number {
  const facingSign = node.orientation.facing === 'negative' ? -1 : 1
  return openness * MAX_SWING_RAD * facingSign
}

/**
 * Swings an opening fill group (its leaf, sash, and glass, from
 * {@link buildOpeningFill}) about its hinge jamb by the given openness, where 0
 * is shut and 1 is fully open. The group's box vertices are baked in world space,
 * so the rotation is composed with a matching offset that keeps the hinge jamb
 * fixed: at openness 0 the transform is the identity, so a shut opening renders
 * exactly as it was built.
 */
export function swingOpeningGroup(
  group: THREE.Object3D,
  node: OpeningSceneNode,
  openness: number,
): void {
  const hinge = hingePoint(node)
  group.quaternion.setFromAxisAngle(UP_AXIS, swingAngle(node, openness))
  const pivoted = hinge.clone().applyQuaternion(group.quaternion)
  group.position.set(hinge.x - pivoted.x, hinge.y - pivoted.y, hinge.z - pivoted.z)
}

/**
 * Swings the opening fill group named for the node within `root` to the given
 * openness. The group is located by its name (the opening id that
 * {@link buildOpeningFill} stamps on it); a node with no built group is ignored,
 * so the runtime can drive every opening on the floor without a guard of its own.
 */
export function applyOpeningSwing(
  root: THREE.Object3D,
  node: OpeningSceneNode,
  openness: number,
): void {
  const group = root.getObjectByName(node.id)
  if (group) {
    swingOpeningGroup(group, node, openness)
  }
}
