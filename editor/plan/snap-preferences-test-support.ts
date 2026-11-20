import { createSettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { createSnapPreferencesStore, type SnapPreferencesStore } from './snap-preferences-store'

/** Shared set-up of the tests of the snap preferences that go through the settings. */

/** The name that the snap preferences are kept under in the settings. */
export const SETTING_NAME = 'snapPreferences'

/** A snap store over a new settings service whose port holds `stored`, if there is a value. */
export function storeHolding(stored?: unknown): {
  port: InMemorySettingsPort
  store: SnapPreferencesStore
} {
  const port = new InMemorySettingsPort()
  if (stored !== undefined) {
    port.write(SETTING_NAME, stored)
  }
  return { port, store: createSnapPreferencesStore(createSettingsService(port)) }
}

/** A settings port that another browser tab can change. */
export interface PortWithOutsideChanges {
  read(name: string): unknown
  write(name: string, value: unknown): void
  onOutsideChange(listener: (name: string) => void): () => void
  /** Stores `value` under `name` without a call to `write`, and tells the listeners of the name. */
  changeOutside(name: string, value: unknown): void
}

/** A port that keeps its values in memory and tells its listeners of a change from outside. */
export function portWithOutsideChanges(): PortWithOutsideChanges {
  const inner = new InMemorySettingsPort()
  const listeners = new Set<(name: string) => void>()
  return {
    read: (name) => inner.read(name),
    write: (name, value) => {
      inner.write(name, value)
    },
    onOutsideChange: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    changeOutside: (name, value) => {
      inner.write(name, value)
      for (const listener of [...listeners]) listener(name)
    },
  }
}
