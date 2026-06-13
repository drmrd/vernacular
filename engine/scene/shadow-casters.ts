import * as THREE from 'three'

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
