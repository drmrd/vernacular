import { surfaceKey, type SurfaceRef } from '../../core'

export interface SurfaceSelectionStore {
  getActiveSurface(): SurfaceRef | null
  isActive(ref: SurfaceRef): boolean
  select(ref: SurfaceRef): void
  clear(): void
  subscribe(listener: () => void): () => void
}

export function createSurfaceSelectionStore(): SurfaceSelectionStore {
  let active: SurfaceRef | null = null
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getActiveSurface: () => active,
    isActive: (ref) => active !== null && surfaceKey(active) === surfaceKey(ref),
    select: (ref) => {
      active = ref
      notify()
    },
    clear: () => {
      active = null
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
