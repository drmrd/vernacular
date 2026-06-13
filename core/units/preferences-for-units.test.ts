import { describe, expect, it } from 'vitest'
import type { UnitPreferences, UnitSystem } from '../index'
import { DEFAULT_IMPERIAL_PREFERENCES, DEFAULT_METRIC_PREFERENCES } from './preferences'
import { preferencesForUnits } from './preferences-for-units'

describe('preferencesForUnits mapping a unit system to its default display preferences', () => {
  it('returns the metric defaults for the metric system', () => {
    const units: UnitSystem = 'metric'
    const preferences: UnitPreferences = preferencesForUnits(units)
    expect(preferences).toBe(DEFAULT_METRIC_PREFERENCES)
  })

  it('returns the imperial defaults for the imperial system', () => {
    const units: UnitSystem = 'imperial'
    const preferences: UnitPreferences = preferencesForUnits(units)
    expect(preferences).toBe(DEFAULT_IMPERIAL_PREFERENCES)
  })
})
