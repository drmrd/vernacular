import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SnapPreferences } from './snap-preferences'
import type { SnapPreferencesStore } from './snap-preferences-store'

export const SnapPreferencesContext = createContext<SnapPreferencesStore | null>(null)

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
