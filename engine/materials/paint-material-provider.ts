import * as THREE from 'three'

import {
  builtinFloorPatterns,
  getEntry,
  surfaceKey,
  surfaceTintHex,
  type LinearRgb,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'
import { roleMaterialParameters, slabTopDepthBiasParameters } from './role-appearance'

export interface PaintMaterialOptions {
  lightColor: LinearRgb
  paint?: Record<string, SurfaceTreatment>
}

/**
 * The shared surface-material machinery for the paint providers. It resolves a
 * surface's SurfaceRef to its assigned treatment and uses that as the albedo; an
 * unpainted or reference-less surface keeps the neutral gray. The color temperature
 * lives in the light (ADR-0065), so a painted surface is shown under the illuminant
 * rather than tinted twice. Painted materials are cached by surface key and neutral
 * ones by role; the subclass supplies each painted material's construction.
 */
export abstract class SurfaceMaterialProvider implements MaterialProvider {
  readonly lightColor: LinearRgb
  private readonly paint: Record<string, SurfaceTreatment>
  private readonly neutralByRole = new Map<SurfaceRole, THREE.Material>()
  private readonly paintedByKey = new Map<string, THREE.Material>()

  constructor(options: PaintMaterialOptions) {
    this.lightColor = options.lightColor
    this.paint = options.paint ?? {}
  }

  material(role: SurfaceRole, ref?: SurfaceRef): THREE.Material {
    if (ref !== undefined) {
      const key = surfaceKey(ref)
      const treatment = this.paint[key]
      if (treatment !== undefined) {
        return this.paintedMaterial(role, key, treatment)
      }
    }
    return this.neutralMaterial(role)
  }

  private paintedMaterial(
    role: SurfaceRole,
    key: string,
    treatment: SurfaceTreatment,
  ): THREE.Material {
    const cached = this.paintedByKey.get(key)
    if (cached) {
      return cached
    }
    const created = this.createPaintedMaterial(role, treatment)
    this.paintedByKey.set(key, created)
    return created
  }

  private neutralMaterial(role: SurfaceRole): THREE.Material {
    const cached = this.neutralByRole.get(role)
    if (cached) {
      return cached
    }
    const created = new THREE.MeshStandardMaterial(roleMaterialParameters(role))
    this.neutralByRole.set(role, created)
    return created
  }

  /** Build the material for a painted surface; the base caches the result under the surface key. */
  protected abstract createPaintedMaterial(
    role: SurfaceRole,
    treatment: SurfaceTreatment,
  ): THREE.Material
}

/**
 * The color-temperature-responsive paint material (foundation 5.2): a painted surface
 * renders as a MeshStandardMaterial tinted by its treatment, and a floor pattern adds
 * its wearing-surface roughness. PhysicalMaterialProvider extends the same base to make
 * a solid paint's finish live.
 */
export class PaintMaterialProvider extends SurfaceMaterialProvider {
  protected createPaintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
    return new THREE.MeshStandardMaterial({
      ...basePaintedParameters(role, treatment),
      ...patternParameters(treatment),
    })
  }
}

/**
 * The parameters every painted surface shares: the treatment tint as the albedo, the
 * role name, and the slab-top depth bias for a painted floor top so the coincident wall
 * base still wins the depth contest. The finish- or pattern-specific fields spread on top.
 * Shared with PhysicalMaterialProvider so both paths resolve the albedo the same way.
 */
export function basePaintedParameters(
  role: SurfaceRole,
  treatment: SurfaceTreatment,
): THREE.MeshStandardMaterialParameters {
  return {
    color: new THREE.Color(surfaceTintHex(treatment)),
    name: role,
    ...(role === 'top' ? slabTopDepthBiasParameters() : {}),
  }
}

/**
 * The extra material parameters a `pattern` treatment contributes: the wearing
 * surface's roughness from the floor-pattern registry and the pattern id as
 * userData so the rendered material stays traceable to its finish. A solid
 * treatment contributes nothing, so its material keeps the prior appearance.
 */
export function patternParameters(
  treatment: SurfaceTreatment,
): THREE.MeshStandardMaterialParameters {
  if (treatment.kind !== 'pattern') {
    return {}
  }
  const pattern = getEntry(builtinFloorPatterns, treatment.patternId)
  return {
    ...(pattern === undefined ? {} : { roughness: pattern.roughness }),
    userData: { patternId: treatment.patternId },
  }
}
