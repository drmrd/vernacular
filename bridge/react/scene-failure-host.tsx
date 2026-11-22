import { useContext, type ReactElement } from 'react'
import { SceneFailureViewContext, type SceneFailureViewProps } from './scene-failure-view-context'
import { sceneRendererFailedProps } from './scene-readiness'

/** Carries the failure marker itself, so a view that fills the slot cannot leave it out. */
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
