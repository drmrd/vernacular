import type { SceneFailureViewProps } from './scene-failure-view-context'

export const PLAIN_CANNOT_RENDER = 'This browser cannot render the 3D view.'
export const PLAIN_COULD_NOT_LOAD =
  'Could not load the 3D view. Check your network connection, then reload the page.'

// A view that fills the failure slot: one button that shows the kind it was given and, for a
// failed load, hands the click to the reload callback it was given.
export function FailureProbe(props: SceneFailureViewProps) {
  return (
    <button
      type="button"
      data-kind={props.kind}
      onClick={props.kind === 'load' ? props.onReload : undefined}
    >
      filled view
    </button>
  )
}
