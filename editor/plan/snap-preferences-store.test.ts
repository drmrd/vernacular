import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_SNAP_PREFERENCES } from './snap-preferences'
import { createSnapPreferencesStore, SNAP_PREFERENCES_STORAGE_KEY } from './snap-preferences-store'

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

function fakeStorage(initial: Record<string, string> = {}): StoragePort {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('createSnapPreferencesStore', () => {
  it('starts at the defaults when storage is empty', () => {
    const store = createSnapPreferencesStore({ storage: fakeStorage() })
    expect(store.getPreferences()).toEqual(DEFAULT_SNAP_PREFERENCES)
  })

  it('toggles a kind and notifies subscribers', () => {
    const store = createSnapPreferencesStore({ storage: fakeStorage() })
    const listener = vi.fn()
    store.subscribe(listener)

    store.toggleKind('grid')

    expect(store.getPreferences().kinds.grid).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sets the master flag and the radius', () => {
    const store = createSnapPreferencesStore({ storage: fakeStorage() })

    store.setEnabled(false)
    store.setPixelRadius(20)

    expect(store.getPreferences().enabled).toBe(false)
    expect(store.getPreferences().pixelRadius).toBe(20)
  })

  it('persists changes so a fresh store over the same storage reloads them', () => {
    const storage = fakeStorage()
    const first = createSnapPreferencesStore({ storage })
    first.toggleKind('angle')
    first.setPixelRadius(18)

    const second = createSnapPreferencesStore({ storage })

    expect(second.getPreferences().kinds.angle).toBe(false)
    expect(second.getPreferences().pixelRadius).toBe(18)
  })

  it('falls back to the defaults when the stored value is malformed', () => {
    const store = createSnapPreferencesStore({
      storage: fakeStorage({ [SNAP_PREFERENCES_STORAGE_KEY]: 'not valid json' }),
    })
    expect(store.getPreferences()).toEqual(DEFAULT_SNAP_PREFERENCES)
  })

  it('fills missing kinds from the defaults when the stored value is partial', () => {
    const store = createSnapPreferencesStore({
      storage: fakeStorage({
        [SNAP_PREFERENCES_STORAGE_KEY]: JSON.stringify({ enabled: false }),
      }),
    })
    expect(store.getPreferences().enabled).toBe(false)
    expect(store.getPreferences().kinds.endpoint).toBe(true)
    expect(store.getPreferences().pixelRadius).toBe(DEFAULT_SNAP_PREFERENCES.pixelRadius)
  })
})
