import { useEffect, useState } from 'react'
import type { ProjectStore } from '../../storage'
import { createAutosave, type AutosaveStatus } from '../autosave/create-autosave'
import type { EditorSession } from '../session/editor-session'

/** Runs the debounced autosave for the session's lifetime and reports its status. */
export function useAutosave(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  useEffect(() => {
    const autosave = createAutosave(session, store, projectId, { onStatusChange: setStatus })
    return () => autosave.dispose()
  }, [session, store, projectId])
  return status
}
