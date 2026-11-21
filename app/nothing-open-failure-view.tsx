import type { ReactElement } from 'react'
import type { SwitchFailure } from '../session'
import { failureText } from './page-notice-text'

const KEPT_UNCHANGED = 'The saved project is kept unchanged. A new project is stored separately.'

/** What the page shows for a failure with no project open: Retry and a new project. */
export interface NothingOpenFailure {
  readonly failure: SwitchFailure
  readonly onRetry: () => void
  readonly onStartFresh: () => void
}

/** The page for a failure with no project open: Retry, and a new project that is stored apart. */
export function nothingOpenFailureView({
  failure,
  onRetry,
  onStartFresh,
}: NothingOpenFailure): ReactElement {
  return (
    <main aria-label="Error">
      <p role="alert">{failureText(failure)}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
      <button type="button" onClick={onStartFresh}>
        Start a new project
      </button>
      {failure.kind !== 'not-found' ? <p>{KEPT_UNCHANGED}</p> : null}
    </main>
  )
}
