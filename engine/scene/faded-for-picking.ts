import type * as THREE from 'three'

/**
 * `userData` key the near-wall fade sets on each material it fades and removes when the
 * material returns to its baseline. The value is the material's own uuid, because
 * `Material.clone` deep-copies `userData`: a clone of a faded material carries a uuid
 * naming a different material, which reads as not faded, exactly right since that copy
 * was never faded.
 */
const FADED_FOR_PICKING = 'fadedForPicking'

/** Marks `material` as faded (or no longer faded) for the pickers to read. */
export function markFadedForPicking(material: THREE.Material, faded: boolean): void {
  if (faded) {
    material.userData[FADED_FOR_PICKING] = material.uuid
  } else {
    delete material.userData[FADED_FOR_PICKING]
  }
}

/** True when the near-wall fade has faded `material` and not yet restored it. */
function isMaterialFaded(material: THREE.Material): boolean {
  return material.userData[FADED_FOR_PICKING] === material.uuid
}

/**
 * True when the near-wall fade currently shows `object` faded: a wall the camera looks at
 * from outside, or an opening, junction fill, or piece of furniture faded with it. The
 * fade privatizes and fades each mesh's own materials, so the hit object itself carries
 * the state; no ancestor is consulted. This relies on a mesh fading whole (every material
 * slot of a faded mesh is faded together), so one flagged material means the whole hit
 * object is faded.
 */
export function isFadedForPicking(object: THREE.Object3D): boolean {
  const material = (object as Partial<Pick<THREE.Mesh, 'material'>>).material
  if (material === undefined) {
    return false
  }
  const materials = Array.isArray(material) ? material : [material]
  return materials.some(isMaterialFaded)
}
