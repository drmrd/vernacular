import * as THREE from 'three'

import type { LinearRgb } from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'

/** A light warm gray shared by every surface role until the paint track assigns real colors. */
const NEUTRAL_COLOR = 0xd8d4cc

export interface PaintMaterialOptions {
  lightColor: LinearRgb
}

/**
 * The stub of the color-temperature-responsive paint material (foundation 5.2). It
 * replaces NeutralMaterialProvider at the material seam and carries the light color, so
 * the paint track widens it to real surface colors additively. The visible warmth comes
 * from the lights (ADR-0065), so this stub does not tint its albedo and avoids double-tinting.
 */
export class PaintMaterialProvider implements MaterialProvider {
  readonly lightColor: LinearRgb
  private readonly materials = new Map<SurfaceRole, THREE.Material>()

  constructor(options: PaintMaterialOptions) {
    this.lightColor = options.lightColor
  }

  material(role: SurfaceRole): THREE.Material {
    const cached = this.materials.get(role)
    if (cached) {
      return cached
    }
    const created = new THREE.MeshStandardMaterial({ color: NEUTRAL_COLOR, name: role })
    this.materials.set(role, created)
    return created
  }
}
