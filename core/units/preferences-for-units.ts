import type { UnitSystem } from '../model/types'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  type UnitPreferences,
} from './preferences'

const DEFAULT_PREFERENCES_BY_SYSTEM: Record<UnitSystem, UnitPreferences> = {
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
  metric: DEFAULT_METRIC_PREFERENCES,
}

/**
 * Returns the default display preferences for a unit system, yielding the exact
 * shared default reference (`DEFAULT_METRIC_PREFERENCES` or
 * `DEFAULT_IMPERIAL_PREFERENCES`) so callers can rely on reference identity.
 */
export function preferencesForUnits(units: UnitSystem): UnitPreferences {
  return DEFAULT_PREFERENCES_BY_SYSTEM[units]
}
