import { describe, it, expect, vi } from 'vitest'
import { createSettingsService } from '../../session'
import { DEFAULT_SNAP_PREFERENCES } from './snap-preferences'
import { createSnapPreferencesStore } from './snap-preferences-store'
import { portWithOutsideChanges, SETTING_NAME, storeHolding } from './snap-preferences-test-support'

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

describe('preferences that another browser tab changed', () => {
  it('calls the subscriber, and then the store gives the new preferences', () => {
    const port = portWithOutsideChanges()
    const store = createSnapPreferencesStore(createSettingsService(port))
    const subscriber = vi.fn()
    store.subscribe(subscriber)
    expect(store.getPreferences()).toBe(DEFAULT_SNAP_PREFERENCES)
    const changed = { ...DEFAULT_SNAP_PREFERENCES, enabled: false }

    port.changeOutside(SETTING_NAME, changed)

    expect(subscriber).toHaveBeenCalledOnce()
    expect(store.getPreferences()).toEqual(changed)
  })
})
