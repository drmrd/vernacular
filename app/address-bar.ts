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
  /**
   * Tells the listeners of the present entry once more, as a window does when it reports one
   * move with two events. Changes no entry and no position.
   */
  reportAgain(): void
  /** Every entry, oldest first. */
  entries(): readonly string[]
  /** The position of the present entry in `entries()`. */
  position(): number
}

const NAVIGATION_EVENTS = ['popstate', 'hashchange'] as const

/** The address bar of a window: its location fragment and its history entries. */
export function createBrowserAddressBar(view: Window): AddressBar {
  // A full URL, so a path that starts with two slashes is not read as another origin.
  const urlWith = (fragment: string): string => {
    const url = new URL(view.location.href)
    url.hash = fragment
    return url.href
  }
  return {
    hash: () => view.location.hash,
    replace: (fragment) => view.history.replaceState(view.history.state, '', urlWith(fragment)),
    push: (fragment) => view.history.pushState(view.history.state, '', urlWith(fragment)),
    onNavigate(listener) {
      const call = (): void => listener()
      for (const name of NAVIGATION_EVENTS) view.addEventListener(name, call)
      return () => {
        for (const name of NAVIGATION_EVENTS) view.removeEventListener(name, call)
      }
    },
  }
}

/** Calls each listener once, skipping one that an earlier listener removed in the same round. */
function notifyListeners(listeners: ReadonlySet<() => void>): void {
  for (const listener of [...listeners]) {
    if (listeners.has(listener)) listener()
  }
}

/** An address bar that keeps its entries in memory, starting with one entry. */
export function createMemoryAddressBar(initial = ''): MemoryAddressBar {
  let entries: string[] = [initial]
  let position = 0
  const listeners = new Set<() => void>()
  const push = (fragment: string): void => {
    entries = [...entries.slice(0, position + 1), fragment]
    position = entries.length - 1
  }
  const moveBy = (step: number): void => {
    const target = position + step
    if (target < 0 || target >= entries.length) return
    position = target
    notifyListeners(listeners)
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
      notifyListeners(listeners)
    },
    reportAgain: () => notifyListeners(listeners),
    entries: () => [...entries],
    position: () => position,
  }
}
