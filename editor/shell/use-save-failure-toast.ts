import { useEffect, useRef } from 'react'
import { useNotifications } from '../design-system'
import type { AutosaveStatus } from '../../bridge'

// Raise one error toast on the transition into the error status, with a Retry action when a retry
// callback is supplied. A ref tracks the previous status so re-renders that keep the status at error
// do not stack duplicate toasts. onRetry is an effect dependency for exhaustiveness, but the same
// transition guard shields against its identity churn: a changing onRetry while the status stays at
// error re-runs the effect without re-raising the toast.
export function useSaveFailureToast(status: AutosaveStatus, onRetry?: () => void): void {
  const { error } = useNotifications()
  const previous = useRef<AutosaveStatus>(status)
  useEffect(() => {
    if (status === 'error' && previous.current !== 'error') {
      error(
        'Save failed. Your latest changes are not saved yet.',
        onRetry ? { actions: [{ label: 'Retry', onAction: onRetry }] } : undefined,
      )
    }
    previous.current = status
  }, [status, error, onRetry])
}
