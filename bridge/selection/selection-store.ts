export interface SelectionStore {
  getSelectedIds(): ReadonlySet<string>
  isSelected(id: string): boolean
  select(id: string): void
  toggle(id: string): void
  setSelection(ids: Iterable<string>): void
  clear(): void
  subscribe(listener: () => void): () => void
}

const EMPTY_SELECTION: ReadonlySet<string> = Object.freeze(new Set<string>())

export function createSelectionStore(): SelectionStore {
  let selected: ReadonlySet<string> = EMPTY_SELECTION
  const listeners = new Set<() => void>()

  const setSelected = (next: ReadonlySet<string>): void => {
    if (next === selected) {
      return
    }
    selected = next
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSelectedIds: () => selected,
    isSelected: (id) => selected.has(id),
    select: (id) => setSelected(new Set([id])),
    toggle: (id) => {
      const next = new Set(selected)
      if (!next.delete(id)) {
        next.add(id)
      }
      setSelected(next)
    },
    setSelection: (ids) => setSelected(new Set(ids)),
    clear: () => setSelected(EMPTY_SELECTION),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
