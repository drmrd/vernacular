import { describe, it, expect } from 'vitest'
import { DEFAULT_SNAP_PREFERENCES } from './snap-preferences'
import { SETTING_NAME, storeHolding } from './snap-preferences-test-support'

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
