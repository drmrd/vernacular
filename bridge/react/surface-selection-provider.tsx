import type { ReactNode } from 'react'
import type { SurfaceSelectionStore } from '../selection/surface-selection-store'
import { SurfaceSelectionContext } from './surface-selection-context'

export interface SurfaceSelectionProviderProps {
  store: SurfaceSelectionStore
  children: ReactNode
}

export function SurfaceSelectionProvider({ store, children }: SurfaceSelectionProviderProps) {
  return (
    <SurfaceSelectionContext.Provider value={store}>{children}</SurfaceSelectionContext.Provider>
  )
}
