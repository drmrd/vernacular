import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ActiveFloorStore } from '../active-floor/active-floor-store'

export const ActiveFloorContext = createContext<ActiveFloorStore | null>(null)

function useActiveFloorStore(): ActiveFloorStore {
  const store = useContext(ActiveFloorContext)
  if (store === null) {
    throw new Error(
      'useActiveFloorId and useSetActiveFloorId must be used within an ActiveFloorProvider',
    )
  }
  return store
}

export function useActiveFloorId(): string | null {
  const store = useActiveFloorStore()
  return useSyncExternalStore(store.subscribe, store.getActiveFloorId)
}

export function useSetActiveFloorId(): (id: string | null) => void {
  return useActiveFloorStore().setActiveFloorId
}
