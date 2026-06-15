import type { Command } from '../../core'
import { useActiveFloorId, useEditorSession, useSceneGraph } from '../../bridge'
import { UnderlayPanel } from './underlay-panel'
import { useUnderlay } from './use-underlay'
import './canvas-reference-control.css'

// The trace-underlay loader, anchored to the canvas rather than the inspector: the
// underlay is a canvas reference layer, so its controls belong with the canvas. The
// container is click-through (pointer-events: none) so it never intercepts drawing on
// the plan beneath it; only its own controls take pointer events.
export function CanvasReferenceControl() {
  const session = useEditorSession()
  const activeFloorId = useActiveFloorId()
  const underlay = useUnderlay()
  useSceneGraph()
  const project = session.getProject()
  const floor =
    project.floors.find((candidate) => candidate.id === activeFloorId) ?? project.floors[0]
  if (floor === undefined) {
    return null
  }
  return (
    <div className="canvas-reference-control">
      <UnderlayPanel
        floorId={floor.id}
        underlays={floor.underlays}
        dispatch={(command) => session.dispatch(command as Command)}
        onLoadImage={underlay.loadImage}
        onCalibrate={underlay.startCalibration}
      />
      <label className="canvas-reference-control__trace">
        <input
          type="checkbox"
          checked={underlay.traceMode}
          onChange={(event) => underlay.setTraceMode(event.target.checked)}
        />{' '}
        Trace underlay
      </label>
    </div>
  )
}
