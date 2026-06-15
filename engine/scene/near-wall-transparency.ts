import * as THREE from 'three'

import type { ExteriorWall } from '../../core'

/** Opacity of a wall the camera looks at from outside, so the interior reads through it. */
const FADED_OPACITY = 0.1

/** Full opacity of a wall the camera is inside of. */
const OPAQUE = 1

/** A horizontal point and outward normal in world space (plan y maps to world Z). */
interface WorldXZ {
  x: number
  z: number
}

/** An exterior wall's own materials plus the world geometry that decides its fade. */
export interface NearWallTarget {
  materials: THREE.Material[]
  point: WorldXZ
  outwardNormal: WorldXZ
}

/**
 * True when the camera sits on the wall's outside, i.e. the horizontal vector from
 * the wall point to the camera points along the outward normal (positive dot).
 */
export function cameraFacesWallOutside(
  camera: WorldXZ,
  point: WorldXZ,
  outwardNormal: WorldXZ,
): boolean {
  return (camera.x - point.x) * outwardNormal.x + (camera.z - point.z) * outwardNormal.z > 0
}

/** The first descendant mesh of `root` whose entity id matches, or null. */
function findMeshByEntityId(root: THREE.Object3D, entityId: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  root.traverse((object) => {
    if (found === null && object instanceof THREE.Mesh && object.userData.entityId === entityId) {
      found = object
    }
  })
  return found
}

/** The materials of a mesh as an array, whether it holds one material or several. */
function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/**
 * Clones each exterior wall's materials into private instances so its opacity
 * animates independently, and records the world point and outward normal that
 * decide whether the camera sees the wall from outside. Walls whose mesh is not
 * found in `root` are skipped.
 */
export function prepareNearWallTransparency(
  root: THREE.Object3D,
  exterior: ExteriorWall[],
): NearWallTarget[] {
  return exterior.flatMap((wall) => {
    const mesh = findMeshByEntityId(root, wall.wallId)
    if (mesh === null) {
      return []
    }
    const cloned = meshMaterials(mesh).map((material) => material.clone())
    mesh.material = cloned
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
    return [
      {
        materials: cloned,
        point: { x: center.x, z: center.z },
        outwardNormal: { x: wall.outwardNormal.x, z: wall.outwardNormal.y },
      },
    ]
  })
}

/**
 * Fades each target's materials when the camera looks at the wall from outside,
 * and restores full opacity otherwise.
 */
export function updateNearWallTransparency(
  targets: NearWallTarget[],
  cameraPosition: WorldXZ,
): void {
  for (const target of targets) {
    const faded = cameraFacesWallOutside(cameraPosition, target.point, target.outwardNormal)
    for (const material of target.materials) {
      material.transparent = faded
      material.opacity = faded ? FADED_OPACITY : OPAQUE
      material.depthWrite = !faded
    }
  }
}
