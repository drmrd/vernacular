import type * as THREE from 'three'

import type { SurfaceRef } from '../../core'

/** A nameable surface of the wall shell that later painting can key on by role. */
export type SurfaceRole =
  | 'interiorFace'
  | 'exteriorFace'
  | 'reveal'
  | 'top'
  | 'base'
  | 'leaf'
  | 'glass'
  // The neutral role for the wall-junction fill's faces.
  | 'junction'
  // The neutral role for a furniture massing box.
  | 'furniture'
  // The role for a furniture massing box whose model failed to load.
  | 'furnitureFailed'
  // The role for a furniture massing box whose model is still loading.
  | 'furnitureLoading'

/**
 * Supplies the material for each surface role. The MVP provider returns a single
 * neutral appearance per role; a future painting provider swaps in here without
 * changing the geometry builders.
 */
export interface MaterialProvider {
  material(role: SurfaceRole, ref?: SurfaceRef): THREE.Material
}
