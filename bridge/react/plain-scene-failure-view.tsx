import type { ReactElement } from 'react'
import { SceneLoadFailedStatus } from './scene-load-failed-status'
import type { SceneFailureViewProps } from './scene-failure-view-context'
import { SceneUnsupportedStatus } from './scene-unsupported-status'

/** The unstyled failure views the bridge shows when nothing fills the failure slot. */
export function PlainSceneFailureView(props: SceneFailureViewProps): ReactElement {
  return props.kind === 'load' ? (
    <SceneLoadFailedStatus onReload={props.onReload} />
  ) : (
    <SceneUnsupportedStatus />
  )
}
