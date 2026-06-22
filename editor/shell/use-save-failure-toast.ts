import { useEffect, useRef } from 'react'
import { useNotifications } from '../design-system'
import type { AutosaveStatus } from '../../bridge'

// Raise one error toast on the transition into the error status. A ref tracks the previous status so
// re-renders that keep the status at error do not stack duplicate toasts.
export function useSaveFailureToast(status: AutosaveStatus): void {
  const { error } = useNotifications()
  const previous = useRef<AutosaveStatus>(status)
  useEffect(() => {
    if (status === 'error' && previous.current !== 'error') {
      error('Save failed. Your latest changes are not saved yet.')
    }
    previous.current = status
  }, [status, error])
}
