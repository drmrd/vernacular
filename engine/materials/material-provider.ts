import type * as THREE from 'three'

/** A nameable surface of the wall shell that later painting can key on by role. */
export type SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'

/**
 * Supplies the material for each surface role. The MVP provider returns a single
 * neutral appearance per role; a future painting provider swaps in here without
 * changing the geometry builders.
 */
export interface MaterialProvider {
  material(role: SurfaceRole): THREE.Material
}
