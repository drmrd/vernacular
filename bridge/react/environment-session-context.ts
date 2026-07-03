import { createContext, useContext, useSyncExternalStore } from 'react'
import type { EnvironmentState } from '../../core'
import type { EnvironmentSessionStore } from '../environment/environment-session-store'

export const EnvironmentSessionContext = createContext<EnvironmentSessionStore | null>(null)

export function useEnvironmentSessionStore(): EnvironmentSessionStore {
  const store = useContext(EnvironmentSessionContext)
  if (store === null) {
    throw new Error('useEnvironmentSessionStore must be used within an EnvironmentSessionProvider')
  }
  return store
}

export function useEnvironmentSession(): {
  environment: EnvironmentState
  setEnvironment: (next: EnvironmentState) => void
} {
  const store = useEnvironmentSessionStore()
  const environment = useSyncExternalStore(store.subscribe, store.getEnvironment)
  return { environment, setEnvironment: store.setEnvironment }
}
