import * as THREE from 'three'

import { markCacheHeld } from '../scene/dispose-object'
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
    markCacheHeld(created)
    this.materials.set(role, created)
    return created
  }

  /** Frees every cached material and empties the cache. Safe to call twice. */
  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
  }
}
