import { useCallback } from 'react'
import { useNotifications } from '../editor/design-system'
import type { FlowResult, FolderRefusal, ImportFailure, RestoreRefusal } from '../session'
import { openFailureReason, type OpenFailureCause } from './open-failure-text'

export { SAVE_FAILED_DURING_SWITCH } from './open-failure-text'

/** How a failed flow is reported: the action it names and whether the toast offers a Retry. */
export interface FlowNoticeOptions {
  /** The action of the "<Action> failed: " form. Default 'Open'. */
  readonly action?: string
  /** When set, the toast has a Retry action that calls it. */
  readonly onRetry?: () => void
}

/** The failures that need no message, because the user chose them or nothing happened. */
const SILENT_KINDS: ReadonlySet<OpenFailureCause['kind']> = new Set([
  'cancelled',
  'nothing-to-restore',
])

/** The failures whose sentence stands alone, with no "<Action> failed: " in front. */
const SENTENCE_KINDS: ReadonlySet<OpenFailureCause['kind']> = new Set([
  'flush-failed',
  'open-elsewhere',
  'not-found',
  'folder-empty',
  'folder-permission',
  'folder-unavailable',
])

/** The text of the error toast for a failure that is shown. */
function noticeText(failure: OpenFailureCause, action: string): string {
  const reason = openFailureReason(failure)
  return SENTENCE_KINDS.has(failure.kind) ? reason : `${action} failed: ${reason}`
}

/** Gives a function that shows what the result of a flow means to the user. */
export function useSwitchNotices(): (
  result: FlowResult<ImportFailure | FolderRefusal | RestoreRefusal> | undefined,
  options?: FlowNoticeOptions,
) => void {
  const { error } = useNotifications()
  return useCallback(
    (result, options) => {
      if (result === undefined || result.ok || SILENT_KINDS.has(result.failure.kind)) {
        return
      }
      const onRetry = options?.onRetry
      const text = noticeText(result.failure, options?.action ?? 'Open')
      if (onRetry === undefined) {
        error(text)
      } else {
        error(text, { actions: [{ label: 'Retry', onAction: onRetry }] })
      }
    },
    [error],
  )
}
