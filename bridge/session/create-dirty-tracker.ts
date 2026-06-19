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
   * Registers a listener fired on each clean<->dirty transition, so the UI can
   * re-render the guard/indicator. Repeated changes in the same direction are
   * coalesced: the listener fires only when `isDirty()` actually flips. Returns
   * an unsubscribe function.
   */
  subscribe(listener: () => void): () => void
  /**
   * Detaches the change listener from the session. Call this when the session is
   * abandoned (New / Open / Import) so the old session can be garbage-collected
   * and stale undo/redo do not fire a dead listener.
   */
  dispose(): void
}

export function createDirtyTracker(session: EditorSession): DirtyTracker {
  // Both start at 0; equal => clean on construction.
  let changeCount = 0
  let savedChangeCount = 0
  // Mirrors isDirty() on construction: a fresh tracker is clean.
  let lastNotifiedDirty = false

  const listeners = new Set<() => void>()

  const isDirty = (): boolean => changeCount !== savedChangeCount

  const notifyIfTransitioned = (): void => {
    const dirty = isDirty()
    if (dirty === lastNotifiedDirty) {
      return
    }
    lastNotifiedDirty = dirty
    for (const listener of listeners) {
      listener()
    }
  }

  const unsubscribe = session.subscribe(() => {
    changeCount += 1
    notifyIfTransitioned()
  })

  const markSaved = (): void => {
    savedChangeCount = changeCount
    notifyIfTransitioned()
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const dispose = (): void => {
    unsubscribe()
    listeners.clear()
  }

  return { isDirty, markSaved, subscribe, dispose }
}
