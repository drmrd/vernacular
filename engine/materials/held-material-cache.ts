import type * as THREE from 'three'

import { markCacheHeld } from '../scene/dispose-object'

/**
 * A cache of materials its owner created and keeps. Every material it creates is marked
 * held before it is cached and returned, so a scene tree walk never frees it; only
 * dispose() does. dispose() frees each cached material once and empties the cache, so a
 * second call finds nothing.
 */
export class HeldMaterialCache<K> {
  private readonly materials = new Map<K, THREE.Material>()

  /** The cached material for the key, built and marked held on first use. */
  get(key: K, create: () => THREE.Material): THREE.Material {
    const cached = this.materials.get(key)
    if (cached) {
      return cached
    }
    const created = create()
    markCacheHeld(created)
    this.materials.set(key, created)
    return created
  }

  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
  }
}
