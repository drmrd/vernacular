import * as THREE from 'three'

import {
  builtinFinishes,
  getEntry,
  surfaceKey,
  type Finish,
  type LinearRgb,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'
import {
  basePaintedParameters,
  patternParameters,
  type PaintMaterialOptions,
} from './paint-material-provider'
import { roleMaterialParameters } from './role-appearance'

/**
 * When a solid paint names a finish the registry does not define, its physical
 * material falls back to a mostly matte roughness so an unknown finish still reads
 * like ordinary wall paint rather than a glossy default.
 */
const UNKNOWN_FINISH_ROUGHNESS = 0.9

/**
 * A finish-aware paint material provider. Like PaintMaterialProvider it uses a
 * painted surface's assigned color as the albedo, but a solid paint additionally
 * reads its finish (roughness, sheen, specular) and emits a MeshPhysicalMaterial,
 * so gloss and flat paints no longer render at one default roughness. A pattern
 * keeps its standard material and an unpainted surface keeps the neutral gray.
 */
export class PhysicalMaterialProvider implements MaterialProvider {
  readonly lightColor: LinearRgb
  private readonly paint: Record<string, SurfaceTreatment>

  constructor(options: PaintMaterialOptions) {
    this.lightColor = options.lightColor
    this.paint = options.paint ?? {}
  }

  material(role: SurfaceRole, ref?: SurfaceRef): THREE.Material {
    if (ref !== undefined) {
      const treatment = this.paint[surfaceKey(ref)]
      if (treatment !== undefined) {
        return paintedMaterial(role, treatment)
      }
    }
    return new THREE.MeshStandardMaterial(roleMaterialParameters(role))
  }
}

/** A solid paint upgrades to a physical material carrying its finish; a pattern keeps the standard one. */
function paintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
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

/** The physical roughness, sheen, and specular a finish contributes, falling back to matte roughness when unknown. */
function finishParameters(finish: Finish | undefined): THREE.MeshPhysicalMaterialParameters {
  if (finish === undefined) {
    return { roughness: UNKNOWN_FINISH_ROUGHNESS }
  }
  return { roughness: finish.roughness, sheen: finish.sheen, specularIntensity: finish.specular }
}
