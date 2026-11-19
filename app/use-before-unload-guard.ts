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
 * Arms the leave warning while the handle has a change that is not stored: a save that waits, or
 * a save that failed.
 */
export function useUnsavedChangesGuard(handle: DocumentHandle): void {
  const status = useSaveStatus(handle)
  useBeforeUnloadGuard(status === 'pending' || status === 'error')
}
