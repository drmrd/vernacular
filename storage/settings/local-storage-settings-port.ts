import { carryLegacySettings } from './legacy-setting-keys'
import type { SettingsPort } from './settings-port'

/** The part of the browser's storage object that the settings port uses. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const SETTING_KEY_PREFIX = 'vernacular.settings.'

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

  /** With no argument: the storage of this browser, or memory where the browser refuses it. */
  constructor(storage?: SettingsStorage) {
    this.storage = storage ?? browserStorage()
    this.unstored = new Map(
      this.storage === null ? [] : carryLegacySettings(this.storage, settingStorageKey),
    )
  }

  read(name: string): unknown {
    if (this.unstored.has(name)) return parseText(this.unstored.get(name))
    return parseText(this.readStoredText(name))
  }

  write(name: string, value: unknown): void {
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
