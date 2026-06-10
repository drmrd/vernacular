export interface ActiveFloorStore {
  getActiveFloorId(): string | null
  setActiveFloorId(id: string | null): void
  subscribe(listener: () => void): () => void
}

export function createActiveFloorStore(initialId: string | null = null): ActiveFloorStore {
  let activeId = initialId
  const listeners = new Set<() => void>()

  return {
    getActiveFloorId: () => activeId,
    setActiveFloorId(id) {
      if (id === activeId) {
        return
      }
      activeId = id
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
