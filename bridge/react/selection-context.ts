import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SelectionStore } from '../selection/selection-store'

export const SelectionContext = createContext<SelectionStore | null>(null)

export function useSelection(): SelectionStore {
  const store = useContext(SelectionContext)
  if (store === null) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return store
}

export function useSelectionIds(): ReadonlySet<string> {
  const store = useSelection()
  return useSyncExternalStore(store.subscribe, store.getSelectedIds)
}
