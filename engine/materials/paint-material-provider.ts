import type * as THREE from 'three'

import type { SurfaceTreatment } from '../../core'
import type { SurfaceRole } from './material-provider'
import { SurfaceMaterialProvider } from './surface-material-provider'

/**
 * The color-temperature-responsive paint material (foundation 5.2): a painted surface
 * renders as a MeshStandardMaterial tinted by its treatment, and a floor pattern adds
 * its wearing-surface roughness. PhysicalMaterialProvider extends the same base to make
 * a solid paint's finish live.
 */
export class PaintMaterialProvider extends SurfaceMaterialProvider {
  protected createPaintedMaterial(role: SurfaceRole, treatment: SurfaceTreatment): THREE.Material {
    return this.standardPaintedMaterial(role, treatment)
  }
}
