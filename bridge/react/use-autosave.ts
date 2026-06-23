import { useEffect } from 'react'
import type { ProjectStore } from '../../storage'
import {
  createAutosave,
  type AutosaveStatus,
  type SnapshotPruner,
  type SnapshotWriter,
} from '../autosave/create-autosave'
import type { EditorSession } from '../session/editor-session'

export interface UseAutosaveOptions {
  session: EditorSession
  store: ProjectStore
  projectId: string
  snapshots?: SnapshotWriter & SnapshotPruner
  /** Receives each autosave status transition. The caller owns the status state so an
   *  explicit save can pulse the same indicator (ADR-0104). */
  onStatusChange: (status: AutosaveStatus) => void
  /** Reads the dirty-tracker revision, captured by autosave at persist time. */
  revision?: () => number
  /** Called with the revision a successful autosave persisted, so the guard disarms
   *  for exactly that revision. */
  onSaved?: (savedRevision: number) => void
}

/** Runs the debounced autosave for the session's lifetime, reporting status and the
 *  persisted revision through the supplied callbacks. */
export function useAutosave(options: UseAutosaveOptions): void {
  const { session, store, projectId, snapshots, onStatusChange, revision, onSaved } = options
  useEffect(() => {
    const autosave = createAutosave({
      session,
      store,
      projectId,
      onStatusChange,
      ...(snapshots ? { snapshots } : {}),
      ...(revision ? { revision } : {}),
      ...(onSaved ? { onSaved } : {}),
    })
    return () => autosave.dispose()
  }, [session, store, projectId, snapshots, onStatusChange, revision, onSaved])
}
