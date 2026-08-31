/**
 * React seam onto the 3D session store.
 *
 * Switching the view mode unmounts the preview subtree, so hooks inside it cannot own the
 * session state they read and write. This context hands them a store that lives above the
 * subtree instead. ADR-0172 records the decision.
 */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SceneSessionState, SceneSessionStore } from '../scene-session/scene-session-store'

export const SceneSessionContext = createContext<SceneSessionStore | null>(null)

export function useSceneSessionStore(): SceneSessionStore {
  const store = useContext(SceneSessionContext)
  if (store === null) {
    throw new Error('useSceneSessionStore must be used within a SceneSessionProvider')
  }
  return store
}

export function useSceneSession(): {
  sceneSession: SceneSessionState
  updateSceneSession: (patch: Partial<SceneSessionState>) => void
} {
  const store = useSceneSessionStore()
  const sceneSession = useSyncExternalStore(store.subscribe, store.getSceneSession)
  return { sceneSession, updateSceneSession: store.updateSceneSession }
}
