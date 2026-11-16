import { useCallback, useSyncExternalStore } from 'react'

import {
  interactiveObjectsAtDefault,
  resetInteractiveObjects,
} from '../scene-session/interactive-objects'

import { useSceneSessionStoreOrLocal } from './scene-session-context'

/** The 3D view's interactive objects as the toolbar needs them. */
export interface InteractiveObjectsState {
  /** True when no interactive object is out of its default state. */
  atDefault: boolean
  /** Returns every interactive object to its default state. */
  reset: () => void
}

/**
 * Reads the interactive-object state from the scene session store (a private per-mount store
 * outside a provider) and binds the reset to that store.
 */
export function useInteractiveObjects(): InteractiveObjectsState {
  const store = useSceneSessionStoreOrLocal()
  const atDefault = useSyncExternalStore(store.subscribe, () =>
    interactiveObjectsAtDefault(store.getSceneSession()),
  )
  const reset = useCallback(() => resetInteractiveObjects(store), [store])
  return { atDefault, reset }
}
