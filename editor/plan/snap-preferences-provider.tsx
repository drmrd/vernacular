import type { ReactNode } from 'react'
import type { SnapPreferencesStore } from './snap-preferences-store'
import { SnapPreferencesContext } from './snap-preferences-context'

export interface SnapPreferencesProviderProps {
  store: SnapPreferencesStore
  children: ReactNode
}

export function SnapPreferencesProvider({ store, children }: SnapPreferencesProviderProps) {
  return <SnapPreferencesContext.Provider value={store}>{children}</SnapPreferencesContext.Provider>
}
