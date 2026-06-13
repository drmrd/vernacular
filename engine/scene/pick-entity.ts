import * as THREE from 'three'

function entityIdOf(object: THREE.Object3D): string | null {
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

/** The entity id of the nearest object a ray strikes, read from userData.entityId on the
 *  hit or its nearest ancestor that carries one; null when the ray strikes nothing. */
export function pickEntityId(raycaster: THREE.Raycaster, root: THREE.Object3D): string | null {
  for (const hit of raycaster.intersectObject(root, true)) {
    const id = entityIdOf(hit.object)
    if (id !== null) {
      return id
    }
  }
  return null
}

/** Sets the raycaster from a camera and a normalized-device-coordinate point, then picks. */
export function pickEntityIdAt(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  root: THREE.Object3D,
  ndc: { x: number; y: number },
): string | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  return pickEntityId(raycaster, root)
}
