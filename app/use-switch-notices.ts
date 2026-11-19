import { useCallback } from 'react'
import { useNotifications } from '../editor/design-system'
import type { FlowResult } from '../session'
import {
  fixedFailureReason,
  openFailureReason,
  type FlowRefusal,
  type OpenFailureCause,
} from './open-failure-text'

/** How a failed flow is reported: the action it names and whether the toast offers a Retry. */
export interface FlowNoticeOptions {
  /** The action of the "<Action> failed: " form. Default 'Open'. */
  readonly action?: string
  /** When set, the toast has a Retry action that calls it. */
  readonly onRetry?: () => void
}

/**
 * The text of the error toast for a failure, or null for a failure that needs no message because
 * the user chose it or nothing happened. A failure whose sentence never changes stands alone, with
 * no "<Action> failed: " in front.
 */
function noticeText(failure: OpenFailureCause, action: string): string | null {
  const fixed = fixedFailureReason(failure)
  if (fixed === undefined) {
    return `${action} failed: ${openFailureReason(failure)}`
  }
  return fixed === '' ? null : fixed
}

/** Gives a function that shows what the result of a flow means to the user. */
export function useSwitchNotices(): (
  result: FlowResult<FlowRefusal> | undefined,
  options?: FlowNoticeOptions,
) => void {
  const { error } = useNotifications()
  return useCallback(
    (result, options) => {
      if (result === undefined || result.ok) {
        return
      }
      const text = noticeText(result.failure, options?.action ?? 'Open')
      if (text === null) {
        return
      }
      const onRetry = options?.onRetry
      if (onRetry === undefined) {
        error(text)
      } else {
        error(text, { actions: [{ label: 'Retry', onAction: onRetry }] })
      }
    },
    [error],
  )
}
