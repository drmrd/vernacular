import { frameSceneCamera, type CameraPose, type SceneGraph } from '../../core'
import { BasicLightingProvider, buildScene, sceneBounds, type SceneRoot } from '../../engine'

export interface FramedScene {
  root: SceneRoot
  pose: CameraPose
}

/**
 * Builds the Three.js scene from the graph, frames a camera on the built
 * geometry's world bounds (before lighting is added, so the lights do not
 * perturb the framing), then applies the fixed basic lighting. An empty scene
 * yields empty bounds, which frame to the fixed default pose.
 */
export function buildFramedScene(graph: SceneGraph): FramedScene {
  const root = buildScene(graph)
  const pose = frameSceneCamera(sceneBounds(root))
  new BasicLightingProvider().apply(root)
  return { root, pose }
}
