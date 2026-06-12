import * as THREE from 'three'
import { frameSceneCamera, type Bounds3, type CameraPose, type SceneGraph } from '../../core'
import { BasicLightingProvider, buildScene } from '../../engine'

export interface FramedScene {
  root: THREE.Group
  pose: CameraPose
}

function boundsOf(box: THREE.Box3): Bounds3 {
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  }
}

/**
 * Builds the Three.js scene from the graph, frames a camera on the built
 * geometry's world bounds (before lighting is added, so the lights do not
 * perturb the framing), then applies the fixed basic lighting. An empty scene
 * yields an empty box, which frames to the fixed default pose.
 */
export function buildFramedScene(graph: SceneGraph): FramedScene {
  const root = buildScene(graph)
  const box = new THREE.Box3().setFromObject(root)
  const pose = frameSceneCamera(box.isEmpty() ? null : boundsOf(box))
  new BasicLightingProvider().apply(root)
  return { root, pose }
}
