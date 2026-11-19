import { expect, vi, type MockInstance } from 'vitest'
import { DEFAULT_SNAP_PREFERENCES } from '../editor/plan/snap-preferences'
import { NEW_SNAP_KEY } from '../storage/settings/settings-storage-test-kit'

/** Shared set-up of the tests of the settings of the application. */

/** Snap preferences as an older build stored them: grid snapping off, everything else on. */
export const OLDER_BUILD_SNAP_TEXT = '{"enabled":true,"kinds":{"grid":false},"pixelRadius":18}'

/** A whole-application case starts the shell, and may need more time on a busy machine. */
export const WHOLE_APPLICATION_TIMEOUT_MS = 20_000

/** A browser storage that keeps its entries in a map, and the spies on its writes and removals. */
export interface BrowserStorageCalls {
  readonly entries: Map<string, string>
  readonly setItem: MockInstance<Storage['setItem']>
  readonly removeItem: MockInstance<Storage['removeItem']>
}

/** A browser storage in a map, reached through the storage object of the test run. */
export function imitateBrowserStorage(
  initial: Readonly<Record<string, string>>,
): BrowserStorageCalls {
  const entries = new Map(Object.entries(initial))
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => entries.get(key) ?? null)
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    entries.set(key, value)
  })
  const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
    entries.delete(key)
  })
  return { entries, setItem, removeItem }
}

/** Expects the entries to hold, under the new key, the default preferences with grid snapping off. */
export function expectStoredWithGridOff(entries: ReadonlyMap<string, string>): void {
  const stored: unknown = JSON.parse(entries.get(NEW_SNAP_KEY) ?? 'null')
  expect(stored).toEqual({
    ...DEFAULT_SNAP_PREFERENCES,
    kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
  })
}
