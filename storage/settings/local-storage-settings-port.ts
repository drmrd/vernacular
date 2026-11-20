import { carryLegacySettings } from './legacy-setting-keys'
import type { SettingsPort } from './settings-port'

/** The part of the browser's storage object that the settings port uses. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The part of the global object that carries the browser's `storage` event. */
export type StorageEventSource = Pick<Window, 'addEventListener' | 'removeEventListener'>

const SETTING_KEY_PREFIX = 'vernacular.settings.'

function browserEventSource(): StorageEventSource | null {
  return typeof globalThis.addEventListener === 'function' ? globalThis : null
}

function settingStorageKey(name: string): string {
  return `${SETTING_KEY_PREFIX}${name}`
}

function browserStorage(): SettingsStorage | null {
  try {
    return (globalThis.localStorage as SettingsStorage | undefined) ?? null
  } catch {
    return null
  }
}

function parseText(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * Keeps each setting as JSON text under its own key of the browser's local storage. A text or a
 * removal that the storage refuses is kept in memory until a later write of that name is taken.
 */
export class LocalStorageSettingsPort implements SettingsPort {
  private readonly storage: SettingsStorage | null
  /** The texts, and the removals (as `undefined`), that the storage did not take. */
  private readonly unstored: Map<string, string | undefined>
  private readonly eventSource: StorageEventSource | null
  private readonly outsideListeners = new Set<(name: string) => void>()
  /** Every name that this port has read or written. */
  private readonly touchedNames = new Set<string>()
  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (this.storage === null || event.storageArea !== this.storage) return
    if (event.key === null) {
      this.tellChanged([...this.touchedNames])
    } else if (event.key.startsWith(SETTING_KEY_PREFIX)) {
      this.tellChanged([event.key.slice(SETTING_KEY_PREFIX.length)])
    }
  }

  /**
   * With no argument: the storage of this browser, or memory where the browser refuses it. The
   * second argument carries the `storage` event; by default it is the global object.
   */
  constructor(storage?: SettingsStorage, eventSource?: StorageEventSource) {
    this.storage = storage ?? browserStorage()
    this.eventSource = eventSource ?? browserEventSource()
    this.unstored = new Map(
      this.storage === null ? [] : carryLegacySettings(this.storage, settingStorageKey),
    )
  }

  read(name: string): unknown {
    this.touchedNames.add(name)
    if (this.unstored.has(name)) return parseText(this.unstored.get(name))
    return parseText(this.readStoredText(name))
  }

  onOutsideChange(listener: (name: string) => void): () => void {
    this.outsideListeners.add(listener)
    if (this.outsideListeners.size === 1) {
      this.eventSource?.addEventListener('storage', this.handleStorageEvent)
    }
    return () => {
      this.outsideListeners.delete(listener)
      if (this.outsideListeners.size === 0) {
        this.eventSource?.removeEventListener('storage', this.handleStorageEvent)
      }
    }
  }

  private tellChanged(names: readonly string[]): void {
    for (const name of names) this.unstored.delete(name)
    for (const listener of [...this.outsideListeners]) {
      for (const name of names) listener(name)
    }
  }

  write(name: string, value: unknown): void {
    this.touchedNames.add(name)
    const text = JSON.stringify(value) as string | undefined
    if (this.store(name, text)) {
      this.unstored.delete(name)
    } else {
      this.unstored.set(name, text)
    }
  }

  private readStoredText(name: string): string | null {
    if (this.storage === null) return null
    try {
      return this.storage.getItem(settingStorageKey(name))
    } catch {
      return null
    }
  }

  private store(name: string, text: string | undefined): boolean {
    if (this.storage === null) return false
    try {
      if (text === undefined) {
        this.storage.removeItem(settingStorageKey(name))
      } else {
        this.storage.setItem(settingStorageKey(name), text)
      }
      return true
    } catch {
      return false
    }
  }
}
