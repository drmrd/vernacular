import * as THREE from 'three'

import type { MaterialProvider, SurfaceRole } from './material-provider'
import { roleMaterialParameters } from './role-appearance'

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
    const created = new THREE.MeshStandardMaterial(roleMaterialParameters(role))
    this.materials.set(role, created)
    return created
  }
}
