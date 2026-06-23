import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { EditorSession } from '../session/editor-session'
import { createDirtyTracker, type DirtyTracker } from '../session/create-dirty-tracker'

/**
 * Subscribes a React component to a dirty tracker so it re-renders on every
 * clean<->dirty transition. Reads the current flag through `useSyncExternalStore`
 * over the tracker's own subscribe/isDirty pair, keeping the guard reactive
 * without copying the dirty state into component state.
 */
export function useDirtyState(tracker: DirtyTracker): boolean {
  return useSyncExternalStore(tracker.subscribe, tracker.isDirty)
}

/** The reactive dirty flag plus the revision-based save-baseline reset, scoped to one session. */
export interface SessionDirtyState {
  isDirty: boolean
  /** The current change revision, to capture before an async save (ADR-0104). */
  revision: () => number
  /** Marks the captured revision saved, clearing dirtiness only if no newer change has arrived. */
  markSavedRevision: (revision: number) => void
}

/**
 * Owns the per-session dirty tracker lifecycle for a component. A fresh session
 * (New / Open / Import result) starts clean, so recreating the tracker per
 * session resets the dirty baseline for free; the paired cleanup disposes the
 * old tracker when the session is replaced or the component unmounts. Returns
 * the reactive `isDirty` flag together with the stable `revision` reader and
 * `markSavedRevision` for clearing the baseline after a save.
 */
export function useDirtyTracker(session: EditorSession): SessionDirtyState {
  const tracker = useMemo(() => createDirtyTracker(session), [session])
  useEffect(() => () => tracker.dispose(), [tracker])
  const isDirty = useDirtyState(tracker)
  const revision = useCallback(() => tracker.revision(), [tracker])
  const markSavedRevision = useCallback((rev: number) => tracker.markSavedRevision(rev), [tracker])
  return { isDirty, revision, markSavedRevision }
}
