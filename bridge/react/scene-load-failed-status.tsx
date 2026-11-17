import { sceneRendererFailedProps } from './scene-readiness'

/**
 * The accessible message that stands in for the 3D viewport when the renderer module did not
 * load, usually after a network error. The message is announced as an alert; the Retry button
 * asks for the module again. Plain elements, because the bridge cannot use the design system.
 */
export function SceneLoadFailedStatus({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="scene-canvas__fallback" {...sceneRendererFailedProps('load')}>
      <p role="alert">Could not load the 3D view. Check your network connection, then retry.</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
