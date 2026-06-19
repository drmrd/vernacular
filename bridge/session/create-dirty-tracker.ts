import type { EditorSession } from './editor-session'

/**
 * Tracks whether an editor session has unsaved changes since it was last saved
 * or freshly loaded. Dirtiness is derived from the dispatch boundary
 * (`session.subscribe`), independent of autosave snapshot status: a fresh
 * session starts clean and the first state-changing dispatch/undo/redo flips it
 * dirty.
 */
export interface DirtyTracker {
  /** Reports whether the session has changed since it was last saved or loaded. */
  isDirty(): boolean
}

export function createDirtyTracker(session: EditorSession): DirtyTracker {
  let dirty = false

  session.subscribe(() => {
    dirty = true
  })

  return {
    isDirty: () => dirty,
  }
}
