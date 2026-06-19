import { useSyncExternalStore } from 'react'
import type { DirtyTracker } from '../session/create-dirty-tracker'

/**
 * Subscribes a React component to a dirty tracker so it re-renders on every
 * clean<->dirty transition. Reads the current flag through `useSyncExternalStore`
 * over the tracker's own subscribe/isDirty pair, keeping the guard reactive
 * without copying the dirty state into component state.
 */
export function useDirtyState(tracker: DirtyTracker): boolean {
  return useSyncExternalStore(tracker.subscribe, tracker.isDirty)
}
