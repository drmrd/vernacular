import { detectRenderBackend } from '../../engine'
import { WebGPUSceneView } from './webgpu-scene-view'

/** The 3D viewport. Renders the WebGPU scene when available, otherwise an accessible
 *  message. The WebGL2 fallback renderer arrives in a later phase. */
export function SceneCanvas() {
  if (detectRenderBackend() !== 'webgpu') {
    return (
      <div role="status" className="scene-canvas__fallback">
        This 3D view requires a WebGPU-capable browser.
      </div>
    )
  }
  return <WebGPUSceneView />
}
