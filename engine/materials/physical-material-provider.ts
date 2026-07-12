import * as THREE from 'three'

import { builtinFinishes, getEntry, type Finish, type SurfaceTreatment } from '../../core'
import type { SurfaceRole } from './material-provider'
import {
  SurfaceMaterialProvider,
  basePaintedParameters,
  patternParameters,
} from './paint-material-provider'

/**
 * When a solid paint names a finish the registry does not define, its physical
 * material falls back to a mostly matte roughness so an unknown finish still reads
 * like ordinary wall paint rather than a glossy default.
 */
const UNKNOWN_FINISH_ROUGHNESS = 0.9

/**
 * A finish-aware paint material provider. It shares the surface-material dispatch and
 * cache with PaintMaterialProvider, but a solid paint additionally reads its finish
 * (roughness, sheen, specular) and emits a MeshPhysicalMaterial, so gloss and flat
 * paints no longer render at one default roughness. A pattern keeps its standard
 * material and an unpainted surface keeps the neutral gray.
 */
export class PhysicalMaterialProvider extends SurfaceMaterialProvider {
  protected createPaintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
    if (treatment.kind !== 'solid') {
      return new THREE.MeshStandardMaterial({
        ...basePaintedParameters(role, treatment),
        ...patternParameters(treatment),
      })
    }
    return new THREE.MeshPhysicalMaterial({
      ...basePaintedParameters(role, treatment),
      ...finishParameters(getEntry(builtinFinishes, treatment.finishId)),
    })
  }
}

/** The physical roughness, sheen, and specular a finish contributes, falling back to matte roughness when unknown. */
function finishParameters(finish: Finish | undefined): THREE.MeshPhysicalMaterialParameters {
  if (finish === undefined) {
    return { roughness: UNKNOWN_FINISH_ROUGHNESS }
  }
  return { roughness: finish.roughness, sheen: finish.sheen, specularIntensity: finish.specular }
}
