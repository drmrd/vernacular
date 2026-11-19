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
