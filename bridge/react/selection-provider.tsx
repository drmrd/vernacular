import type { ReactNode } from 'react'
import type { SelectionStore } from '../selection/selection-store'
import { SelectionContext } from './selection-context'

export interface SelectionProviderProps {
  store: SelectionStore
  children: ReactNode
}

export function SelectionProvider({ store, children }: SelectionProviderProps) {
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>
}
