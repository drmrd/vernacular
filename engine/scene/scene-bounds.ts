import * as THREE from 'three'

import type { Bounds3 } from '../../core'

import type { SceneRoot } from './build-scene'

/**
 * World-space axis-aligned bounds of a built scene tree, or null when it holds no
 * renderable geometry (an empty THREE.Box3). frameSceneCamera maps that null to the
 * fixed default pose, so callers never have to handle an Infinity-valued box.
 */
export function sceneBounds(root: SceneRoot): Bounds3 | null {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) {
    return null
  }
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  }
}
