import { detectLivePreviewBackend } from './live-preview-backend'
import { WebGPUSceneView } from './webgpu-scene-view'

/** The 3D viewport. Renders the live scene whenever the runtime can drive a backend, on
 *  WebGPU or on the renderer's own WebGL 2 fallback, and an accessible message when it
 *  can drive neither. */
export function SceneCanvas() {
  if (detectLivePreviewBackend() === 'unsupported') {
    return (
      <div role="status" className="scene-canvas__fallback">
        This browser cannot render the 3D view.
      </div>
    )
  }
  return <WebGPUSceneView />
}
