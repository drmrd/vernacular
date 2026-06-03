import type * as THREE from 'three'

/**
 * Supplies the lights for a scene. The MVP provider sets up a fixed sun and fill;
 * the phase-8 solar provider swaps in here without changing the renderer.
 */
export interface LightingProvider {
  apply(scene: THREE.Object3D): void
}
