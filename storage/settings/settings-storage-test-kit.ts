import type { SettingsStorage } from './local-storage-settings-port'

/** Shared set-up of the tests of the browser settings port: storage objects with known faults. */

/** The name of one method of a settings storage. */
export type SettingsStorageMethod = keyof SettingsStorage

/** A settings storage whose entries a test can look into and change. */
export interface MemoryStorage extends SettingsStorage {
  readonly entries: Map<string, string>
}

/** A storage object that keeps its entries in a map, starting with `initial`. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): MemoryStorage {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}

function securityError(): DOMException {
  return new DOMException('The storage refuses this call.', 'SecurityError')
}

/** Throws a security error when `method` is one of the refused ones, and runs `action` if not. */
function unlessRefused<T>(
  refused: ReadonlySet<SettingsStorageMethod>,
  method: SettingsStorageMethod,
  action: () => T,
): T {
  if (refused.has(method)) {
    throw securityError()
  }
  return action()
}

/** A storage whose named methods throw a `SecurityError`. The other methods pass through. */
export function refusing(
  storage: SettingsStorage,
  methods: readonly SettingsStorageMethod[],
): SettingsStorage {
  const refused = new Set(methods)
  return {
    getItem: (key) => unlessRefused(refused, 'getItem', () => storage.getItem(key)),
    setItem: (key, value) =>
      unlessRefused(refused, 'setItem', () => {
        storage.setItem(key, value)
      }),
    removeItem: (key) =>
      unlessRefused(refused, 'removeItem', () => {
        storage.removeItem(key)
      }),
  }
}

/** A storage whose `setItem` returns and stores nothing. The other methods pass through. */
export function dropping(storage: SettingsStorage): SettingsStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: () => undefined,
    removeItem: (key) => {
      storage.removeItem(key)
    },
  }
}
