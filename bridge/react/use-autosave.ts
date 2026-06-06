import { useEffect, useState } from 'react'
import type { ProjectStore } from '../../storage'
import {
  createAutosave,
  type AutosaveStatus,
  type SnapshotWriter,
} from '../autosave/create-autosave'
import type { EditorSession } from '../session/editor-session'

/** Runs the debounced autosave for the session's lifetime and reports its status. */
export function useAutosave(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
  snapshots?: SnapshotWriter,
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  useEffect(() => {
    const autosave = createAutosave({
      session,
      store,
      projectId,
      onStatusChange: setStatus,
      ...(snapshots ? { snapshots } : {}),
    })
    return () => autosave.dispose()
  }, [session, store, projectId, snapshots])
  return status
}
