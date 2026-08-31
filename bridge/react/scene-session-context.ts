/**
 * React seam onto the 3D session store.
 *
 * Switching the view mode unmounts the preview subtree, so hooks inside it cannot own the
 * session state they read and write. This context hands them a store that lives above the
 * subtree instead. ADR-0172 records the decision.
 */
import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import {
  createSceneSessionStore,
  type SceneSessionState,
  type SceneSessionStore,
} from '../scene-session/scene-session-store'

export const SceneSessionContext = createContext<SceneSessionStore | null>(null)

export function useSceneSessionStore(): SceneSessionStore {
  const store = useContext(SceneSessionContext)
  if (store === null) {
    throw new Error('useSceneSessionStore must be used within a SceneSessionProvider')
  }
  return store
}

/**
 * The provider's store when there is one, otherwise a store this mount keeps to itself.
 *
 * Hooks inside the preview subtree also run where no provider is mounted, in stories and in
 * tests, and they have to keep working there. A provider is what lifts the store above the
 * view-mode unmount, so it is the provider, not the hook, that makes the session survive.
 */
export function useSceneSessionOrLocal(): SceneSessionStore {
  const providedStore = useContext(SceneSessionContext)
  // Created on every mount so the hook order stays the same whether or not a provider is
  // above; the local store goes unused when one is.
  const [localStore] = useState(() => createSceneSessionStore())
  return providedStore ?? localStore
}

export function useSceneSession(): {
  sceneSession: SceneSessionState
  updateSceneSession: (patch: Partial<SceneSessionState>) => void
} {
  const store = useSceneSessionStore()
  const sceneSession = useSyncExternalStore(store.subscribe, store.getSceneSession)
  return { sceneSession, updateSceneSession: store.updateSceneSession }
}
