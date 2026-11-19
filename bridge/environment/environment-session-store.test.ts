import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState } from '../../core'
import { createEnvironmentSessionStore } from './environment-session-store'

const overcastAfternoon: EnvironmentState = {
  mode: 'realistic',
  observedAt: { date: '2026-12-04', minutesSinceMidnight: 960 },
  cloudCover: 0.6,
  colorCheck: true,
}

const earlySummerMorning: EnvironmentState = {
  mode: 'schematic',
  observedAt: { date: '2026-06-21', minutesSinceMidnight: 480 },
  cloudCover: 0.4,
  colorCheck: false,
}

describe('createEnvironmentSessionStore', () => {
  it('starts from the state it is given, and from the default state when given none', () => {
    const seeded = createEnvironmentSessionStore(earlySummerMorning)
    const unseeded = createEnvironmentSessionStore()

    expect(seeded.getEnvironment()).toEqual(earlySummerMorning)
    expect(unseeded.getEnvironment()).toEqual(DEFAULT_ENVIRONMENT_STATE)
  })

  it('starts at the default environment state', () => {
    const store = createEnvironmentSessionStore()

    expect(store.getEnvironment()).toEqual(DEFAULT_ENVIRONMENT_STATE)
  })

  it('replaces the environment state and notifies subscribers', () => {
    const store = createEnvironmentSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.setEnvironment(overcastAfternoon)

    expect(store.getEnvironment()).toEqual(overcastAfternoon)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a subscriber once it unsubscribes', () => {
    const store = createEnvironmentSessionStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.setEnvironment(overcastAfternoon)

    expect(listener).not.toHaveBeenCalled()
  })
})
