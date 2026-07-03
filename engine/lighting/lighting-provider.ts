import type * as THREE from 'three'

import type { Bounds3, EnvironmentLighting } from '../../core'

/**
 * Supplies the lights for a scene. The MVP provider sets up a fixed sun and fill;
 * a future solar-aware provider swaps in here without changing the renderer.
 */
export interface LightingProvider {
  /** One-time light creation: builds the rig and adds it to the scene. */
  apply(scene: THREE.Object3D): void
  /**
   * Re-aims and re-tints an already-applied rig for a computed environment,
   * which varies with the observation time. Providers whose lighting is static
   * may ignore it.
   */
  update(scene: THREE.Object3D, lighting: EnvironmentLighting, bounds: Bounds3 | null): void
}
