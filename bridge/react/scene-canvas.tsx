import { detectRenderBackend } from '../../engine'
import { SceneUnsupportedStatus } from './scene-unsupported-status'
import { WebGPUSceneView } from './webgpu-scene-view'

/** The 3D viewport. Renders the live scene whenever the runtime can drive a backend, on
 *  WebGPU or on the renderer's own WebGL 2 fallback, and an accessible message when it
 *  can drive neither. */
export function SceneCanvas() {
  if (detectRenderBackend() === 'unsupported') return <SceneUnsupportedStatus />
  return <WebGPUSceneView />
}
