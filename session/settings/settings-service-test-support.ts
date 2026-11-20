import type { SettingsPort } from '../../storage'
import type { SettingKey } from './settings-service'

/** Shared set-up of the tests of the settings service: a text setting and its checks. */

/** The name of the text setting of the tests. */
export const TEXT_NAME = 'text'

/** The value of the text setting when nothing valid is stored. */
export const TEXT_DEFAULT = 'fallback'

/** Accepts a stored text and refuses every other stored value. */
export function parseText(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/** A key of the text setting whose check is `parse`, under `name` if one is given. */
export function textKeyWith(
  parse: (raw: unknown) => string | undefined,
  name = TEXT_NAME,
): SettingKey<string> {
  return { name, defaultValue: TEXT_DEFAULT, parse }
}

/** Accepts a stored text and gives it in capitals. Refuses every other stored value. */
export function parseTextInCapitals(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw.toUpperCase() : undefined
}

/** A settings port that another browser tab can change, and that counts the listeners it has. */
export interface PortWithOutsideChanges extends SettingsPort {
  onOutsideChange(listener: (name: string) => void): () => void
  /** The number of listeners that the port has now. */
  readonly listenerCount: () => number
  /** Stores `value` under `name` without a call to `write`, and tells the listeners of the name. */
  changeOutside(name: string, value: unknown): void
}

/** A port that keeps its values in a map and has the member that tells of a change from outside. */
export function portWithOutsideChanges(): PortWithOutsideChanges {
  const values = new Map<string, unknown>()
  const listeners = new Set<(name: string) => void>()
  return {
    read: (name) => values.get(name),
    write: (name, value) => {
      values.set(name, value)
    },
    onOutsideChange: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    listenerCount: () => listeners.size,
    changeOutside: (name, value) => {
      values.set(name, value)
      for (const listener of [...listeners]) listener(name)
    },
  }
}
