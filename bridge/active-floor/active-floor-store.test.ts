import { describe, expect, it, vi } from 'vitest'

import { createActiveFloorStore } from './active-floor-store'

describe('createActiveFloorStore', () => {
  it('returns the current active floor id and notifies subscribers on change', () => {
    const store = createActiveFloorStore('f1')
    expect(store.getActiveFloorId()).toBe('f1')

    const listener = vi.fn()
    store.subscribe(listener)

    store.setActiveFloorId('f2')
    expect(store.getActiveFloorId()).toBe('f2')
    expect(listener).toHaveBeenCalledTimes(1)

    store.setActiveFloorId('f2')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
