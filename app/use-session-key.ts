import { useRef } from 'react'
import type { EditorSession } from '../bridge'

// A stable remount key per session object. Within a session the same key recurs,
// so within-session re-renders never remount the keyed subtree (the user's chosen
// tool survives). A New/Open/restore swaps in a fresh session object, which earns
// the next key, remounting the subtree so the initial-tool decision re-runs (#351).
// The map and counter live in one ref because they are a single registry: assigning
// a never-seen session the next integer is idempotent across React's Strict-Mode
// double render (the second render finds the key already recorded).
export function useSessionKey(session: EditorSession): number {
  const registry = useRef({ keys: new WeakMap<EditorSession, number>(), next: 0 })
  const existing = registry.current.keys.get(session)
  if (existing !== undefined) {
    return existing
  }
  const assigned = registry.current.next++
  registry.current.keys.set(session, assigned)
  return assigned
}
