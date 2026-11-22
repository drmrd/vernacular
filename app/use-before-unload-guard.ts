import { useEffect, useSyncExternalStore } from 'react'
import type { DocumentHandle, SaveStatus } from '../session'

/**
 * Warns the browser before the tab unloads while the project has unsaved
 * changes, so a refresh or close prompts the native leave warning. The
 * listener is armed only while `isDirty` is true and is removed on transition
 * to clean and on unmount, so it never leaks across sessions.
 */
export function useBeforeUnloadGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      // Legacy cross-browser beforeunload idiom: a truthy returnValue is still
      // required alongside preventDefault to trigger the native leave prompt in
      // some browsers, so the TypeScript "deprecated" hint here is intentional.
      event.returnValue = true
    }

    window.addEventListener('beforeunload', warnBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
    }
  }, [isDirty])
}

/** The save status of the handle, read again each time it changes. */
export function useSaveStatus(handle: DocumentHandle): SaveStatus {
  return useSyncExternalStore(handle.subscribe, handle.saveStatus)
}

/**
 * Arms the leave warning while the project is not stored beyond this tab: from the first moment
 * while the handle is not durable, whatever its save status, and while a durable handle has a save
 * that waits or a save that failed. A durable handle that is saved does not arm it.
 */
export function useLeaveWarningGuard(handle: DocumentHandle): void {
  const status = useSaveStatus(handle)
  useBeforeUnloadGuard(!handle.durable || status === 'pending' || status === 'error')
}
