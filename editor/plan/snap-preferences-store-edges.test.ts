import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { DEFAULT_SNAP_PREFERENCES, SNAP_PREFERENCES_SETTING } from './snap-preferences'
import { createSnapPreferencesStore, type SnapPreferencesStore } from './snap-preferences-store'

/** The name that the snap preferences are kept under in the settings. */
const SETTING_NAME = 'snapPreferences'

/** The text of a radius that is too large for a number: JSON reads it as infinity. */
const OVERSIZED_RADIUS_TEXT = '{"pixelRadius":1e999}'

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case can pass through it.
beforeEach(() => {
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A snap store over a new settings service whose port holds `stored`, if there is a value. */
function storeHolding(stored?: unknown): {
  port: InMemorySettingsPort
  store: SnapPreferencesStore
} {
  const port = new InMemorySettingsPort()
  if (stored !== undefined) {
    port.write(SETTING_NAME, stored)
  }
  return { port, store: createSnapPreferencesStore(createSettingsService(port)) }
}

/** The value that JSON text gives, as a browser port would read it. */
function fromText(text: string): unknown {
  return JSON.parse(text)
}

describe('a stored value with missing fields', () => {
  it('becomes the whole preferences object at the first change', () => {
    const { port, store } = storeHolding({ enabled: false })

    store.toggleKind('grid')

    expect(port.read(SETTING_NAME)).toEqual({
      enabled: false,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
      pixelRadius: DEFAULT_SNAP_PREFERENCES.pixelRadius,
    })
  })

  it('gives the same preferences object twice', () => {
    const { store } = storeHolding({ enabled: false })

    expect(store.getPreferences()).toBe(store.getPreferences())
  })
})

describe('a stored value that fails its check', () => {
  it('gives the default preferences object itself', () => {
    const { store } = storeHolding('not an object')

    expect(store.getPreferences()).toBe(DEFAULT_SNAP_PREFERENCES)
  })
})

describe('a stored value with an own __proto__ key', () => {
  it('at the top level changes nothing', () => {
    const withKey = fromText('{"enabled":false,"__proto__":{"polluted":true}}')
    const withoutKey = fromText('{"enabled":false}')

    expect(SNAP_PREFERENCES_SETTING.parse(withKey)).toEqual(
      SNAP_PREFERENCES_SETTING.parse(withoutKey),
    )
    expect(storeHolding(withKey).store.getPreferences().enabled).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('inside the kinds changes nothing', () => {
    const withKey = fromText('{"kinds":{"grid":false,"__proto__":{"polluted":true}}}')
    const withoutKey = fromText('{"kinds":{"grid":false}}')

    expect(SNAP_PREFERENCES_SETTING.parse(withKey)).toEqual(
      SNAP_PREFERENCES_SETTING.parse(withoutKey),
    )
    expect(storeHolding(withKey).store.getPreferences().kinds.grid).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

describe('a stored radius that is too large for a number', () => {
  it('records the present behavior: the radius is read as infinity and is not clamped on read', () => {
    const parsed = SNAP_PREFERENCES_SETTING.parse(fromText(OVERSIZED_RADIUS_TEXT))

    expect(parsed?.pixelRadius).toBe(Infinity)
  })
})
