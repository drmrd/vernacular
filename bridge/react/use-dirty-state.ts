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

/** The reactive dirty flag plus the save-baseline reset, scoped to one session. */
export interface SessionDirtyState {
  isDirty: boolean
  markSaved: () => void
}

/**
 * Owns the per-session dirty tracker lifecycle for a component. A fresh session
 * (New / Open / Import result) starts clean, so recreating the tracker per
 * session resets the dirty baseline for free; the paired cleanup disposes the
 * old tracker when the session is replaced or the component unmounts. Returns
 * the reactive `isDirty` flag and a stable `markSaved` for clearing the baseline
 * after an explicit save.
 */
export function useDirtyTracker(session: EditorSession): SessionDirtyState {
  const tracker = useMemo(() => createDirtyTracker(session), [session])
  useEffect(() => () => tracker.dispose(), [tracker])
  const isDirty = useDirtyState(tracker)
  const markSaved = useCallback(() => tracker.markSaved(), [tracker])
  return { isDirty, markSaved }
}
