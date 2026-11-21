/** The fragment of the page's address, and the history entries that hold it. */
export interface AddressBar {
  /** The fragment now, with its '#', or '' when there is none. */
  hash(): string
  /** Puts the fragment into the present history entry. The path and the query stay. */
  replace(fragment: string): void
  /** Adds a history entry with the fragment. The path and the query stay. */
  push(fragment: string): void
  /** Calls the listener after the user moved through the history or edited the fragment. */
  onNavigate(listener: () => void): () => void
}

/** An address bar in memory, with the moves of a user. */
export interface MemoryAddressBar extends AddressBar {
  /** Moves to the entry before the present one, or does nothing at the first. */
  back(): void
  /** Moves to the entry after the present one, or does nothing at the last. */
  forward(): void
  /** What a user does who types an address: a new entry, and the listeners hear of it. */
  visit(fragment: string): void
  /** Every entry, oldest first. */
  entries(): readonly string[]
  /** The position of the present entry in `entries()`. */
  position(): number
}

const NAVIGATION_EVENTS = ['popstate', 'hashchange'] as const

/** The address bar of a window: its location fragment and its history entries. */
export function createBrowserAddressBar(view: Window): AddressBar {
  const write = (fragment: string, change: 'replaceState' | 'pushState'): void => {
    const { pathname, search } = view.location
    view.history[change](view.history.state, '', pathname + search + fragment)
  }
  return {
    hash: () => view.location.hash,
    replace: (fragment) => write(fragment, 'replaceState'),
    push: (fragment) => write(fragment, 'pushState'),
    onNavigate(listener) {
      for (const name of NAVIGATION_EVENTS) view.addEventListener(name, listener)
      return () => {
        for (const name of NAVIGATION_EVENTS) view.removeEventListener(name, listener)
      }
    },
  }
}

/** An address bar that keeps its entries in memory, starting with one entry. */
export function createMemoryAddressBar(initial = ''): MemoryAddressBar {
  let entries: string[] = [initial]
  let position = 0
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const push = (fragment: string): void => {
    entries = [...entries.slice(0, position + 1), fragment]
    position = entries.length - 1
  }
  const moveBy = (step: number): void => {
    const target = position + step
    if (target < 0 || target >= entries.length) return
    position = target
    notify()
  }
  return {
    hash: () => entries[position] ?? '',
    replace(fragment) {
      entries = entries.map((entry, index) => (index === position ? fragment : entry))
    },
    push,
    onNavigate(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    back: () => moveBy(-1),
    forward: () => moveBy(1),
    visit(fragment) {
      push(fragment)
      notify()
    },
    entries: () => [...entries],
    position: () => position,
  }
}
