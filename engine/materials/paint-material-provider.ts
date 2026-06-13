import * as THREE from 'three'

import { surfaceKey, type LinearRgb, type SurfaceRef, type SurfaceTreatment } from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'

/** A light warm gray shared by every surface role until a surface carries real paint. */
const NEUTRAL_COLOR = 0xd8d4cc

export interface PaintMaterialOptions {
  lightColor: LinearRgb
  paint?: Record<string, SurfaceTreatment>
}

/**
 * The color-temperature-responsive paint material (foundation 5.2). It resolves a
 * surface's SurfaceRef to its assigned paint color and uses that as the albedo; an
 * unpainted or reference-less surface keeps the neutral gray. The color temperature
 * lives in the light (ADR-0065), so a painted surface is shown under the illuminant
 * rather than tinted twice. Painted materials are cached by surface key and neutral
 * ones by role.
 */
export class PaintMaterialProvider implements MaterialProvider {
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
    const created = new THREE.MeshStandardMaterial({
      color: new THREE.Color(treatment.color.srgbHex),
      name: role,
    })
    this.paintedByKey.set(key, created)
    return created
  }

  private neutralMaterial(role: SurfaceRole): THREE.Material {
    const cached = this.neutralByRole.get(role)
    if (cached) {
      return cached
    }
    const created = new THREE.MeshStandardMaterial({ color: NEUTRAL_COLOR, name: role })
    this.neutralByRole.set(role, created)
    return created
  }
}
