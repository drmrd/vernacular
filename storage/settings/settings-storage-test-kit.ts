import type { SettingsStorage } from './local-storage-settings-port'

/** Shared set-up of the tests of the browser settings port: storage objects with known faults. */

/** The key under which an older build stored the snap preferences. */
export const OLD_SNAP_KEY = 'vernacular.snap-preferences'

/** The key under which the snap preferences are stored now. */
export const NEW_SNAP_KEY = 'vernacular.settings.snapPreferences'

/** Snap preferences as an older build stored them under the old key: master off, grid off, radius 12. */
export const OLD_SNAP_TEXT = '{"enabled":false,"kinds":{"grid":false},"pixelRadius":12}'

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

/**
 * A storage whose `getItem` of `key` throws a `SecurityError` from the call numbered `fromCall` on
 * (the first call is number 1). Reads of other keys, and the other methods, pass through.
 */
export function refusingReadOf(
  storage: SettingsStorage,
  key: string,
  fromCall: number = 1,
): SettingsStorage {
  let calls = 0
  return {
    getItem: (asked) => {
      if (asked !== key) return storage.getItem(asked)
      calls += 1
      if (calls >= fromCall) throw securityError()
      return storage.getItem(asked)
    },
    setItem: (asked, value) => {
      storage.setItem(asked, value)
    },
    removeItem: (asked) => {
      storage.removeItem(asked)
    },
  }
}

/** A storage whose `setItem` stores `otherText` instead of the text it was given. */
export function storingOtherText(storage: SettingsStorage, otherText: string): SettingsStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key) => {
      storage.setItem(key, otherText)
    },
    removeItem: (key) => {
      storage.removeItem(key)
    },
  }
}
