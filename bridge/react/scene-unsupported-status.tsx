import { sceneRendererFailedProps } from './scene-readiness'

/** The accessible message that stands in for the 3D viewport when the browser cannot render it. */
export function SceneUnsupportedStatus() {
  return (
    <div role="status" className="scene-canvas__fallback" {...sceneRendererFailedProps('start')}>
      This browser cannot render the 3D view.
    </div>
  )
}
