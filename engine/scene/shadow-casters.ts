import * as THREE from 'three'

import { OPENING_FILL_ROLE_KEY } from './opening-fill-builder'

const GLASS_ROLE = 'glass'

/** True for exactly a mesh the opening-fill builder stamped with the glass role. */
export function isGlassPane(object: THREE.Object3D): boolean {
  return object instanceof THREE.Mesh && object.userData[OPENING_FILL_ROLE_KEY] === GLASS_ROLE
}

/** Flags every mesh in a built scene tree as a shadow caster and receiver, so each
 *  wall both throws and catches shadows under the directional sun. */
export function markShadowCasters(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
}
