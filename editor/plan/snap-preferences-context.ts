import { createContext, useContext, useSyncExternalStore } from 'react'
import { DEFAULT_SNAP_PREFERENCES, type SnapPreferences } from './snap-preferences'
import type { SnapPreferencesStore } from './snap-preferences-store'

export const SnapPreferencesContext = createContext<SnapPreferencesStore | null>(null)

const NOOP_SUBSCRIBE = (): (() => void) => () => {}
const GET_DEFAULT_PREFERENCES = (): SnapPreferences => DEFAULT_SNAP_PREFERENCES

/** The snap-preferences store from context; throws outside a provider. */
export function useSnapPreferencesStore(): SnapPreferencesStore {
  const store = useContext(SnapPreferencesContext)
  if (store === null) {
    throw new Error('useSnapPreferencesStore must be used within a SnapPreferencesProvider')
  }
  return store
}

/** The live snap preferences, re-read whenever the store changes. */
export function useSnapPreferences(): SnapPreferences {
  const store = useSnapPreferencesStore()
  return useSyncExternalStore(store.subscribe, store.getPreferences)
}

/** The live snap preferences, or the defaults when no provider is present. */
export function useOptionalSnapPreferences(): SnapPreferences {
  const store = useContext(SnapPreferencesContext)
  return useSyncExternalStore(
    store?.subscribe ?? NOOP_SUBSCRIBE,
    store?.getPreferences ?? GET_DEFAULT_PREFERENCES,
  )
}
