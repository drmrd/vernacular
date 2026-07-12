import * as THREE from 'three'

import { builtinFinishes, getEntry, type SurfaceTreatment } from '../../core'
import type { SurfaceRole } from './material-provider'
import { SurfaceMaterialProvider, basePaintedParameters } from './surface-material-provider'

/**
 * A solid paint that names a finish the registry does not define renders like the
 * matte finish: ordinary wall paint, so an unknown finish never inherits three.js's
 * glossy specular default of 1.0.
 */
const FALLBACK_FINISH_ID = 'matte'

/**
 * A finish-aware paint material provider. It shares the surface-material dispatch and
 * cache with PaintMaterialProvider, but a solid paint additionally reads its finish
 * (roughness, sheen, specular) and emits a MeshPhysicalMaterial, so gloss and flat
 * paints no longer render at one default roughness. A pattern keeps its standard
 * material and an unpainted surface keeps the neutral gray.
 */
export class PhysicalMaterialProvider extends SurfaceMaterialProvider {
  protected createPaintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
    if (treatment.kind === 'solid') {
      return new THREE.MeshPhysicalMaterial({
        ...basePaintedParameters(role, treatment),
        ...finishParameters(treatment.finishId),
      })
    }
    return this.standardPaintedMaterial(role, treatment)
  }
}

/**
 * The physical roughness, sheen, and specular a finish contributes. An unregistered
 * finishId falls back to the matte finish, so every parameter comes from one real
 * registry entry rather than three.js's material defaults.
 */
function finishParameters(finishId: string): THREE.MeshPhysicalMaterialParameters {
  const finish =
    getEntry(builtinFinishes, finishId) ?? getEntry(builtinFinishes, FALLBACK_FINISH_ID)
  if (finish === undefined) {
    return {}
  }
  return { roughness: finish.roughness, sheen: finish.sheen, specularIntensity: finish.specular }
}
