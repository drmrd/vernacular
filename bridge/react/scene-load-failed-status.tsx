import { sceneRendererFailedProps } from './scene-readiness'

/**
 * The accessible message that stands in for the 3D viewport when the renderer module did not
 * load, usually after a network error. The message is announced as an alert; the Reload page
 * button calls `onReload`. The button reloads the page instead of asking for the module again
 * because the browser keeps a failed dynamic import for that address and does not fetch it a
 * second time. The page's unload guard asks the user to confirm when there are unsaved edits.
 * Plain elements, because the bridge cannot use the design system.
 */
export function SceneLoadFailedStatus({ onReload }: { onReload: () => void }) {
  return (
    <div className="scene-canvas__fallback" {...sceneRendererFailedProps('load')}>
      <p role="alert">
        Could not load the 3D view. Check your network connection, then reload the page.
      </p>
      <button type="button" onClick={onReload}>
        Reload page
      </button>
    </div>
  )
}
