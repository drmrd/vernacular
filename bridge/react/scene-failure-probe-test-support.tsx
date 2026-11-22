import type { SceneFailureViewProps } from './scene-failure-view-context'

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
