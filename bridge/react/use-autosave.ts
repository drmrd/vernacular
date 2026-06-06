import { useEffect, useState } from 'react'
import type { ProjectStore } from '../../storage'
import {
  createAutosave,
  type AutosaveStatus,
  type SnapshotWriter,
} from '../autosave/create-autosave'
import type { EditorSession } from '../session/editor-session'

export interface UseAutosaveOptions {
  session: EditorSession
  store: ProjectStore
  projectId: string
  snapshots?: SnapshotWriter
}

/** Runs the debounced autosave for the session's lifetime and reports its status. */
export function useAutosave(options: UseAutosaveOptions): AutosaveStatus {
  const { session, store, projectId, snapshots } = options
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
