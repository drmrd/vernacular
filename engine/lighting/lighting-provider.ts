import type * as THREE from 'three'

/**
 * Supplies the lights for a scene. The MVP provider sets up a fixed sun and fill;
 * a future solar-aware provider swaps in here without changing the renderer.
 */
export interface LightingProvider {
  apply(scene: THREE.Object3D): void
}
