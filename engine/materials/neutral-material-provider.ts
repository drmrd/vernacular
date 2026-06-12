import * as THREE from 'three'

import type { MaterialProvider, SurfaceRole } from './material-provider'

/** A light warm gray shared by every surface role until painting assigns real colors. */
const NEUTRAL_COLOR = 0xd8d4cc

/**
 * MVP material provider: every role currently gets the same neutral appearance.
 * Each role-named material is created once and cached, so the role identity is
 * what later painting keys on.
 */
export class NeutralMaterialProvider implements MaterialProvider {
  private readonly materials = new Map<SurfaceRole, THREE.Material>()

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
