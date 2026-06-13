import {
  frameSceneCamera,
  kelvinToLinearRgb,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type SceneGraph,
} from '../../core'
import {
  buildScene,
  markShadowCasters,
  PaintMaterialProvider,
  sceneBounds,
  type SceneRoot,
} from '../../engine'

export interface FramedScene {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
}

/**
 * Builds the Three.js scene from the graph through the PaintMaterial seam, flags its
 * meshes as shadow casters and receivers, and frames a camera on its world bounds.
 * Lighting is no longer added here: the lights live on the persistent render scene via
 * <SceneLighting> so the color-temperature slider updates them without a rebuild, and
 * keeping the lights out of the build keeps them out of the framed bounds.
 */
export function buildFramedScene(graph: SceneGraph): FramedScene {
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
  })
  const root = buildScene(graph, materials)
  markShadowCasters(root)
  const bounds = sceneBounds(root)
  const pose = frameSceneCamera(bounds)
  return { root, pose, bounds }
}
