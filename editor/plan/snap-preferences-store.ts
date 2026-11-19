import { createSettingsService, type SettingsService } from '../../session'
import {
  SNAP_PREFERENCES_SETTING,
  setSnapEnabled,
  setSnapPixelRadius,
  toggleSnapKind,
  type SnapPreferences,
  type TogglableSnapKind,
} from './snap-preferences'

/** An editor-owned store of the user's snap preferences, kept through the settings service. */
export interface SnapPreferencesStore {
  getPreferences(): SnapPreferences
  setEnabled(enabled: boolean): void
  toggleKind(kind: TogglableSnapKind): void
  setPixelRadius(radius: number): void
  subscribe(listener: () => void): () => void
}

/**
 * A store over the snap preferences setting of `settings`. It keeps no copy of its own, so two
 * stores over one service, and a change made through the service itself, stay in step. With no
 * service the store keeps its preferences in a memory service of its own.
 */
export function createSnapPreferencesStore(
  settings: SettingsService = createSettingsService(),
): SnapPreferencesStore {
  const current = (): SnapPreferences => settings.get(SNAP_PREFERENCES_SETTING)
  const update = (next: SnapPreferences): void => {
    settings.set(SNAP_PREFERENCES_SETTING, next)
  }

  return {
    getPreferences: current,
    setEnabled: (enabled) => update(setSnapEnabled(current(), enabled)),
    toggleKind: (kind) => update(toggleSnapKind(current(), kind)),
    setPixelRadius: (radius) => update(setSnapPixelRadius(current(), radius)),
    subscribe: (listener) => settings.subscribe(SNAP_PREFERENCES_SETTING, () => listener()),
  }
}
