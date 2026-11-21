import type { ReactElement } from 'react'
import type { DocumentHandle, SwitchFailure } from '../session'
import { fixedFailureReason, openFailureReason } from './open-failure-text'

const NOT_AVAILABLE_YET = 'The list of projects is not available yet.'
const KEPT_UNCHANGED = 'The saved project is kept unchanged. A new project is stored separately.'

/** What the page shows, and the ways out of it. */
export interface InterimProjectsInputs {
  /** Why no project shows, or null when the page was asked for. */
  readonly failure: SwitchFailure | null
  /** The project that stays open under the page, or null when none is open. */
  readonly handle: DocumentHandle | null
  /** Tries again what the failure says did not work. */
  readonly onRetry: () => void
  /** Starts a new project. Offered only when no project is open. */
  readonly onStartFresh: () => void
  /** Leaves the page: back to the open project, or to the project used last. */
  readonly onLeave: () => void
}

// Why the project did not open, in one sentence. A failure with a fixed text shows it alone; every
// other failure names its reason after a fixed opening.
function failureText(failure: SwitchFailure): string {
  const fixed = fixedFailureReason(failure)
  if (fixed !== undefined && fixed !== '') {
    return fixed
  }
  return `Could not open the project: ${openFailureReason(failure)}`
}

function failureView(failure: SwitchFailure, inputs: InterimProjectsInputs): ReactElement {
  const { handle } = inputs
  return (
    <main aria-label="Error">
      <p role="alert">{failureText(failure)}</p>
      <button type="button" onClick={inputs.onRetry}>
        Retry
      </button>
      {handle === null ? (
        <button type="button" onClick={inputs.onStartFresh}>
          Start a new project
        </button>
      ) : (
        <button type="button" onClick={inputs.onLeave}>
          Return to the project
        </button>
      )}
      {handle === null && failure.kind !== 'not-found' ? <p>{KEPT_UNCHANGED}</p> : null}
    </main>
  )
}

function pageView(inputs: InterimProjectsInputs): ReactElement {
  const { handle } = inputs
  return (
    <main aria-label="Projects">
      <p role="status">{NOT_AVAILABLE_YET}</p>
      <button type="button" onClick={inputs.onLeave}>
        {handle === null ? 'Open the last project' : 'Return to the project'}
      </button>
    </main>
  )
}

/**
 * The page of projects until the list of projects exists: why a project did not open, or that the
 * list is not available yet, with the ways out. Plain elements, because this renders above the
 * editor's provider tree.
 */
export function interimProjectsView(inputs: InterimProjectsInputs): ReactElement {
  return inputs.failure === null ? pageView(inputs) : failureView(inputs.failure, inputs)
}
