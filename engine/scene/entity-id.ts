import type * as THREE from 'three'

/**
 * The entity id carried on a renderable object or the nearest ancestor that has one
 * (foundation 5.1: every renderable carries `userData.entityId`). A hit on any sub-mesh
 * of a multi-part entity (a wall with reveals, a room shell with a slab and a ceiling)
 * resolves to the one entity id. Returns null when no ancestor carries an id.
 */
export function entityIdOf(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current !== null) {
    const id = current.userData.entityId
    if (typeof id === 'string') {
      return id
    }
    current = current.parent
  }
  return null
}
