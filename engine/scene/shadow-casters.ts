import * as THREE from 'three'

import type { OpeningFillRole } from '../../core'
import { OPENING_FILL_ROLE_KEY } from './opening-fill-builder'

const GLASS_ROLE: OpeningFillRole = 'glass'

/** True for exactly a mesh the opening-fill builder stamped with the glass role. */
export function isGlassPane(object: THREE.Object3D): boolean {
  return object instanceof THREE.Mesh && object.userData[OPENING_FILL_ROLE_KEY] === GLASS_ROLE
}

/** Flags every mesh in a built scene tree as a shadow receiver, so each wall catches
 *  shadows under the directional sun, and as a shadow caster except for glass panes,
 *  which let daylight pass through instead of throwing a shadow. */
export function markShadowCasters(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !isGlassPane(object)
      object.receiveShadow = true
    }
  })
}
