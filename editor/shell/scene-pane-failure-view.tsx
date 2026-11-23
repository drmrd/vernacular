import type { ReactElement } from 'react'

import type { SceneFailureViewProps } from '../../bridge/react/scene-failure-view-context'
import { Button, EmptyState } from '../design-system'
import { SCENE_FAILURE_COPY } from './scene-failure-copy'
import './scene-pane-failure-view.css'

export function ScenePaneFailureView(props: SceneFailureViewProps): ReactElement {
  const { title, description } = SCENE_FAILURE_COPY[props.kind]
  const action =
    props.kind === 'load' ? (
      <Button variant="primary" onClick={props.onReload}>
        Reload page
      </Button>
    ) : undefined
  return (
    <div className="scene-pane__failure">
      <EmptyState asRegion={false} title={title} description={description} action={action} />
    </div>
  )
}
