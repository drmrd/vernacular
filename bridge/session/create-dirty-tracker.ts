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
  /**
   * Marks the current session state as the saved baseline, clearing dirtiness.
   * Repeatable: a later state-changing dispatch/undo/redo flips it dirty again.
   * Call this after an explicit save so subsequent edits re-arm the guard.
   */
  markSaved(): void
  /**
   * Detaches the change listener from the session. Call this when the session is
   * abandoned (New / Open / Import) so the old session can be garbage-collected
   * and stale undo/redo do not fire a dead listener.
   */
  dispose(): void
}

export function createDirtyTracker(session: EditorSession): DirtyTracker {
  let changeCount = 0
  let savedChangeCount = 0

  const unsubscribe = session.subscribe(() => {
    changeCount += 1
  })

  return {
    isDirty: () => changeCount !== savedChangeCount,
    markSaved() {
      savedChangeCount = changeCount
    },
    dispose() {
      unsubscribe()
    },
  }
}
