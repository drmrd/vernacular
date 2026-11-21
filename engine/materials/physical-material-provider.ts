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
 * The sheen lobe's roughness. 1 is the broadest lobe, closest to a diffuse haze and
 * least likely to read as a cloth highlight. It matches three.js's default, pinned here
 * so a three.js upgrade cannot silently change how a finish looks.
 */
const SHEEN_ROUGHNESS = 1

/**
 * A finish-aware paint material provider. It shares the surface-material dispatch and
 * cache with SurfaceMaterialProvider, but a solid paint additionally reads its finish
 * (roughness, sheen, specular) and emits a MeshPhysicalMaterial, so gloss and flat
 * paints no longer render at one default roughness. The sheen lobe takes the paint's
 * own color, because three.js leaves it black and a black sheen renders nothing. A pattern keeps its standard
 * material and an unpainted surface keeps the neutral gray.
 */
export class PhysicalMaterialProvider extends SurfaceMaterialProvider {
  protected createPaintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
    if (treatment.kind === 'solid') {
      const base = basePaintedParameters(role, treatment)
      return new THREE.MeshPhysicalMaterial({
        ...base,
        ...finishParameters(treatment.finishId),
        ...(base.color === undefined ? {} : { sheenColor: base.color }),
        sheenRoughness: SHEEN_ROUGHNESS,
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
    // Unreachable while matte stays a registered builtin finish. The empty set would
    // otherwise let three.js reapply the glossy defaults this fallback exists to avoid.
    return {}
  }
  return { roughness: finish.roughness, sheen: finish.sheen, specularIntensity: finish.specular }
}
