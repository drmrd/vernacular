import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SurfaceRef } from '../../core'
import type { SurfaceSelectionStore } from '../selection/surface-selection-store'

export const SurfaceSelectionContext = createContext<SurfaceSelectionStore | null>(null)

export function useSurfaceSelection(): SurfaceSelectionStore {
  const store = useContext(SurfaceSelectionContext)
  if (store === null) {
    throw new Error('useSurfaceSelection must be used within a SurfaceSelectionProvider')
  }
  return store
}

export function useActiveSurface(): SurfaceRef | null {
  const store = useSurfaceSelection()
  return useSyncExternalStore(store.subscribe, store.getActiveSurface)
}
