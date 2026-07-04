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
   * may ignore it. The bounds are the scene content's bounds, used to refit the
   * sun's shadow frustum after a re-aim; null means an empty scene, and a
   * provider must treat the shadow refit as a no-op in that case.
   */
  update(scene: THREE.Object3D, lighting: EnvironmentLighting, bounds: Bounds3 | null): void
  /**
   * Removes the lights this provider applied from the scene and frees their GPU
   * resources (a directional sun's shadow map is a 2048x2048 texture), so a provider
   * swap does not leak. A provider that never applied, or already disposed, is a no-op.
   */
  dispose(scene: THREE.Object3D): void
  /**
   * Resolves once any asynchronous lighting resources this provider loads (for the
   * solar provider, the lazily imported visible sky) have finished attaching.
   * Absent or immediately resolved for providers with no async resources.
   */
  whenReady?(): Promise<void>
}
