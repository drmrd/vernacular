import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { createSettingsService, type SettingKey, type SettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { DEFAULT_SNAP_PREFERENCES, type SnapPreferences } from './snap-preferences'
import { createSnapPreferencesStore, type SnapPreferencesStore } from './snap-preferences-store'

/** The name that the snap preferences are kept under in the settings. */
const SETTING_NAME = 'snapPreferences'

/** A key of the same setting, made by the test, so that it can set the setting from outside the store. */
const SNAP_SETTING_FROM_OUTSIDE: SettingKey<SnapPreferences> = {
  name: SETTING_NAME,
  defaultValue: DEFAULT_SNAP_PREFERENCES,
  parse: (raw) => raw as SnapPreferences,
}

let browserReads: MockInstance<Storage['getItem']>
let browserWrites: MockInstance<Storage['setItem']>

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case can pass through it.
beforeEach(() => {
  browserReads = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  browserWrites = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

interface StoreOverPort {
  port: InMemorySettingsPort
  service: SettingsService
  store: SnapPreferencesStore
}

/** A snap store over a new settings service, over `port`. */
function storeOver(port = new InMemorySettingsPort()): StoreOverPort {
  const service = createSettingsService(port)
  return { port, service, store: createSnapPreferencesStore(service) }
}

describe('a snap preferences store over the settings', () => {
  it('starts at the defaults over an empty service', () => {
    const { store } = storeOver()

    expect(store.getPreferences()).toEqual(DEFAULT_SNAP_PREFERENCES)
  })

  it('toggles a kind and notifies subscribers once', () => {
    const { store } = storeOver()
    const listener = vi.fn()
    store.subscribe(listener)

    store.toggleKind('grid')

    expect(store.getPreferences().kinds.grid).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sets the master flag and the radius', () => {
    const { store } = storeOver()

    store.setEnabled(false)
    store.setPixelRadius(20)

    expect(store.getPreferences().enabled).toBe(false)
    expect(store.getPreferences().pixelRadius).toBe(20)
  })

  it('stores each change in the settings port', () => {
    const { port, store } = storeOver()

    store.toggleKind('grid')

    expect(port.read(SETTING_NAME)).toEqual(store.getPreferences())
    expect(port.read(SETTING_NAME)).toEqual({
      ...DEFAULT_SNAP_PREFERENCES,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
    })
  })

  it('a new store over the same port starts with the stored preferences', () => {
    const { port, store: first } = storeOver()
    first.toggleKind('angle')
    first.setPixelRadius(18)

    const { store: second } = storeOver(port)

    expect(second.getPreferences().kinds.angle).toBe(false)
    expect(second.getPreferences().pixelRadius).toBe(18)
  })

  it('preferences in the form that the old key held are in effect', () => {
    const port = new InMemorySettingsPort()
    port.write(SETTING_NAME, { enabled: false, kinds: { grid: false }, pixelRadius: 18 })

    const { store } = storeOver(port)

    expect(store.getPreferences()).toEqual({
      enabled: false,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
      pixelRadius: 18,
    })
  })

  it('falls back to the defaults when the stored value is not an object', () => {
    const port = new InMemorySettingsPort()
    port.write(SETTING_NAME, 'not an object')

    const { store } = storeOver(port)

    expect(store.getPreferences()).toEqual(DEFAULT_SNAP_PREFERENCES)
    expect(port.read(SETTING_NAME)).toBe('not an object')
  })
})

describe('snap preferences stores that share the settings', () => {
  it("two stores over one service show each other's changes", () => {
    const service = createSettingsService(new InMemorySettingsPort())
    const first = createSnapPreferencesStore(service)
    const second = createSnapPreferencesStore(service)
    const secondListener = vi.fn()
    second.subscribe(secondListener)

    first.toggleKind('grid')
    expect(second.getPreferences().kinds.grid).toBe(false)
    expect(secondListener).toHaveBeenCalledTimes(1)

    second.setPixelRadius(20)
    expect(first.getPreferences().pixelRadius).toBe(20)
  })

  it('a change made through the service reaches the subscribers of the store', () => {
    const { service, store } = storeOver()
    const listener = vi.fn()
    store.subscribe(listener)

    service.set(SNAP_SETTING_FROM_OUTSIDE, { ...DEFAULT_SNAP_PREFERENCES, enabled: false })

    expect(listener.mock.calls).toEqual([[]])
    expect(store.getPreferences().enabled).toBe(false)
  })

  it('a store made with no argument calls no browser storage, and two such stores share nothing', () => {
    const first = createSnapPreferencesStore()
    const second = createSnapPreferencesStore()

    first.toggleKind('grid')

    expect(first.getPreferences().kinds.grid).toBe(false)
    expect(second.getPreferences().kinds.grid).toBe(true)
    expect(browserReads).not.toHaveBeenCalled()
    expect(browserWrites).not.toHaveBeenCalled()
  })
})

describe('the snap preferences that a store gives out', () => {
  it('gives the same preferences object until a change', () => {
    const { store } = storeOver()
    const before = store.getPreferences()
    expect(store.getPreferences()).toBe(before)

    store.toggleKind('grid')

    const after = store.getPreferences()
    expect(after).not.toBe(before)
    expect(store.getPreferences()).toBe(after)
  })

  it('an ended subscription is not called', () => {
    const { store } = storeOver()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.toggleKind('grid')

    expect(listener).not.toHaveBeenCalled()
  })
})
