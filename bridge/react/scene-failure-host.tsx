import { useContext } from 'react'
import type { ReactElement } from 'react'
import { SceneFailureViewContext } from './scene-failure-view-context'
import type { SceneFailureViewProps } from './scene-failure-view-context'
import { sceneRendererFailedProps } from './scene-readiness'

/** Renders the failure view that fills the slot, inside the element that marks the failure kind. */
export function SceneFailureHost(props: SceneFailureViewProps): ReactElement {
  const FailureView = useContext(SceneFailureViewContext)
  return (
    <div
      className="scene-canvas__fallback"
      style={{ width: '100%', height: '100%' }}
      {...sceneRendererFailedProps(props.kind)}
    >
      <FailureView {...props} />
    </div>
  )
}
