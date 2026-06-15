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

/** The first descendant of `root` (or `root` itself) satisfying `predicate`, else null. */
function findNodeBy(
  root: THREE.Object3D,
  predicate: (node: THREE.Object3D) => boolean,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((node) => {
    if (found === null && predicate(node)) {
      found = node
    }
  })
  return found
}

/** The first descendant mesh of `root` whose entity id matches, or null. */
function findMeshByEntityId(root: THREE.Object3D, entityId: string): THREE.Mesh | null {
  return findNodeBy(
    root,
    (node) => node instanceof THREE.Mesh && node.userData.entityId === entityId,
  ) as THREE.Mesh | null
}

/** The materials of a mesh as an array, whether it holds one material or several. */
function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Replaces a mesh's materials with private clones (single stays single) and returns them. */
function privatizeMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const cloned = meshMaterials(mesh).map((material) => material.clone())
  mesh.material = Array.isArray(mesh.material) ? cloned : (cloned[0] as THREE.Material)
  return cloned
}

/** Clones the materials of every mesh under the object carrying `entityId`, or none if absent. */
function cloneEntityMaterials(root: THREE.Object3D, entityId: string): THREE.Material[] {
  const anchor = findNodeBy(root, (node) => node.userData.entityId === entityId)
  if (anchor === null) {
    return []
  }
  const cloned: THREE.Material[] = []
  anchor.traverse((descendant) => {
    if (descendant instanceof THREE.Mesh) {
      cloned.push(...privatizeMeshMaterials(descendant))
    }
  })
  return cloned
}

/**
 * Clones each exterior wall's materials, plus those of its hosted openings, into
 * private instances so the wall and its openings fade together while their opacity
 * animates independently of the rest of the scene. Records the world point and
 * outward normal that decide whether the camera sees the wall from outside. Walls
 * whose mesh is not found in `root` are skipped.
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
    const materials = [
      ...privatizeMeshMaterials(mesh),
      ...wall.openingIds.flatMap((openingId) => cloneEntityMaterials(root, openingId)),
    ]
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
    return [
      {
        materials,
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
