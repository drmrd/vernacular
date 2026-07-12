import * as THREE from 'three'

import type { LinearRgb } from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'
import type { PaintMaterialOptions } from './paint-material-provider'
import { roleMaterialParameters } from './role-appearance'

/**
 * A finish-aware paint material provider. Like PaintMaterialProvider it uses a
 * painted surface's assigned color as the albedo, but a solid paint additionally
 * reads its finish (roughness, sheen, specular) so gloss and flat paints no longer
 * render at one default roughness. An unpainted surface keeps the neutral gray.
 */
export class PhysicalMaterialProvider implements MaterialProvider {
  readonly lightColor: LinearRgb

  constructor(options: PaintMaterialOptions) {
    this.lightColor = options.lightColor
  }

  material(role: SurfaceRole): THREE.Material {
    return new THREE.MeshStandardMaterial(roleMaterialParameters(role))
  }
}
