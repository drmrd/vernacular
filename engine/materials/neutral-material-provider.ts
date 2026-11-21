import * as THREE from 'three'

import { HeldMaterialCache } from './held-material-cache'
import type { MaterialProvider, SurfaceRole } from './material-provider'
import { roleMaterialParameters } from './role-appearance'

/**
 * MVP material provider: every role currently gets the same neutral appearance.
 * Each role-named material is created once and cached, so the role identity is
 * what later painting keys on. The provider owns the materials; only dispose() frees them.
 */
export class NeutralMaterialProvider implements MaterialProvider {
  private readonly materials = new HeldMaterialCache<SurfaceRole>()

  material(role: SurfaceRole): THREE.Material {
    return this.materials.get(
      role,
      () => new THREE.MeshStandardMaterial(roleMaterialParameters(role)),
    )
  }

  /** Frees every cached material and empties the cache. Safe to call twice. */
  dispose(): void {
    this.materials.dispose()
  }
}
