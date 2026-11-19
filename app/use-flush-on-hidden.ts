import { useEffect } from 'react'
import type { DocumentHandle } from '../session'

/**
 * Asks the handle to write what is unsaved each time the page becomes hidden. The outcome is not
 * read here: the save status of the handle shows it.
 */
export function useFlushOnHidden(handle: DocumentHandle): void {
  useEffect(() => {
    const flushWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        void handle.flush()
      }
    }
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [handle])
}
