import type { ReactNode } from 'react'
import type { EnvironmentSessionStore } from '../environment/environment-session-store'
import { EnvironmentSessionContext } from './environment-session-context'

export interface EnvironmentSessionProviderProps {
  store: EnvironmentSessionStore
  children: ReactNode
}

export function EnvironmentSessionProvider({ store, children }: EnvironmentSessionProviderProps) {
  return (
    <EnvironmentSessionContext.Provider value={store}>
      {children}
    </EnvironmentSessionContext.Provider>
  )
}
