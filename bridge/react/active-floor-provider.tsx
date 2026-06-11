import type { ReactNode } from 'react'
import type { ActiveFloorStore } from '../active-floor/active-floor-store'
import { ActiveFloorContext } from './active-floor-context'

export interface ActiveFloorProviderProps {
  store: ActiveFloorStore
  children: ReactNode
}

export function ActiveFloorProvider({ store, children }: ActiveFloorProviderProps) {
  return <ActiveFloorContext.Provider value={store}>{children}</ActiveFloorContext.Provider>
}
