import type { SettingsStorage } from './local-storage-settings-port'

const SETTING_KEY_PREFIX = 'vernacular.settings.'

/** The storage key of a setting. */
export function settingStorageKey(name: string): string {
  return `${SETTING_KEY_PREFIX}${name}`
}

/** Each setting that an older build stored under a key of its own. */
export const LEGACY_SETTING_KEYS: ReadonlyArray<readonly [name: string, oldKey: string]> = [
  ['snapPreferences', 'vernacular.snap-preferences'],
]

/**
 * Copies each old text, unchanged and unparsed, to its new key, and removes the old key once the
 * new key reads back equal. Where a text is already under the new key, both keys stay as they are.
 * Returns the texts that the storage did not take, by setting name.
 */
export function carryLegacySettings(storage: SettingsStorage): Map<string, string> {
  const untaken = new Map<string, string>()
  for (const [name, oldKey] of LEGACY_SETTING_KEYS) {
    const text = carryOne(storage, settingStorageKey(name), oldKey)
    if (text !== undefined) untaken.set(name, text)
  }
  return untaken
}

function carryOne(storage: SettingsStorage, newKey: string, oldKey: string): string | undefined {
  let oldText: string | null
  try {
    oldText = storage.getItem(oldKey)
    if (oldText === null || storage.getItem(newKey) !== null) return undefined
  } catch {
    return undefined
  }
  return copyAcross(storage, { oldKey, newKey, text: oldText }) ? undefined : oldText
}

interface Copy {
  readonly oldKey: string
  readonly newKey: string
  readonly text: string
}

function copyAcross(storage: SettingsStorage, copy: Copy): boolean {
  try {
    storage.setItem(copy.newKey, copy.text)
    if (storage.getItem(copy.newKey) !== copy.text) return false
  } catch {
    return false
  }
  try {
    storage.removeItem(copy.oldKey)
  } catch {
    // The old key may stay: the new key is the one that is read.
  }
  return true
}
