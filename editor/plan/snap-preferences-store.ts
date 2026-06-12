import {
  DEFAULT_SNAP_PREFERENCES,
  setSnapEnabled,
  setSnapPixelRadius,
  toggleSnapKind,
  TOGGLABLE_SNAP_KINDS,
  type SnapPreferences,
  type TogglableSnapKind,
} from './snap-preferences'

/** The namespaced key the editor snap preferences are persisted under. */
export const SNAP_PREFERENCES_STORAGE_KEY = 'vernacular.snap-preferences'

/** The narrow slice of the Web Storage API the store reads and writes. */
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

/** An editor-owned, persisted store of the user's snap preferences. */
export interface SnapPreferencesStore {
  getPreferences(): SnapPreferences
  setEnabled(enabled: boolean): void
  toggleKind(kind: TogglableSnapKind): void
  setPixelRadius(radius: number): void
  subscribe(listener: () => void): () => void
}

export interface SnapPreferencesStoreOptions {
  /** The storage to persist into. Defaults to `localStorage` when available. */
  storage?: StoragePort
}

/** Resolve the injected storage, or `localStorage`, or null when neither is reachable. */
function resolveStorage(storage?: StoragePort): StoragePort | null {
  if (storage !== undefined) {
    return storage
  }
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Reading `localStorage` can throw in private-mode or sandboxed contexts.
    return null
  }
}

/** Coerce an unknown parsed value into valid preferences, filling gaps from the defaults. */
function sanitize(parsed: unknown): SnapPreferences {
  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_SNAP_PREFERENCES
  }
  const value = parsed as Partial<Record<keyof SnapPreferences, unknown>>
  const kinds = { ...DEFAULT_SNAP_PREFERENCES.kinds }
  const storedKinds = value.kinds
  if (typeof storedKinds === 'object' && storedKinds !== null) {
    for (const kind of TOGGLABLE_SNAP_KINDS) {
      const flag = (storedKinds as Record<string, unknown>)[kind]
      if (typeof flag === 'boolean') {
        kinds[kind] = flag
      }
    }
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SNAP_PREFERENCES.enabled,
    kinds,
    pixelRadius:
      typeof value.pixelRadius === 'number'
        ? value.pixelRadius
        : DEFAULT_SNAP_PREFERENCES.pixelRadius,
  }
}

/** Load and sanitize the persisted preferences, or the defaults when none are stored. */
function load(storage: StoragePort | null): SnapPreferences {
  if (storage === null) {
    return DEFAULT_SNAP_PREFERENCES
  }
  const raw = storage.getItem(SNAP_PREFERENCES_STORAGE_KEY)
  if (raw === null) {
    return DEFAULT_SNAP_PREFERENCES
  }
  try {
    return sanitize(JSON.parse(raw))
  } catch {
    // A malformed stored value falls back to the defaults rather than throwing.
    return DEFAULT_SNAP_PREFERENCES
  }
}

export function createSnapPreferencesStore(
  options: SnapPreferencesStoreOptions = {},
): SnapPreferencesStore {
  const storage = resolveStorage(options.storage)
  let preferences = load(storage)
  const listeners = new Set<() => void>()

  const persist = (next: SnapPreferences): void => {
    if (storage === null) {
      return
    }
    try {
      storage.setItem(SNAP_PREFERENCES_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Writing can throw on quota or in private mode; the change still applies in memory.
      return
    }
  }

  const update = (next: SnapPreferences): void => {
    preferences = next
    persist(next)
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getPreferences: () => preferences,
    setEnabled: (enabled) => update(setSnapEnabled(preferences, enabled)),
    toggleKind: (kind) => update(toggleSnapKind(preferences, kind)),
    setPixelRadius: (radius) => update(setSnapPixelRadius(preferences, radius)),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
