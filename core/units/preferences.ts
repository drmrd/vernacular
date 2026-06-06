import type { UnitSystem } from '../model/types'
import type { FormatLengthOptions } from './format-length'
import type { ImperialForm, MetricForm } from './length-units'
import type { DisplayPrecision } from './precision'

export interface UnitPreferences {
  system: UnitSystem
  imperialForm: ImperialForm
  metricForm: MetricForm
  imperialLengthPrecision: DisplayPrecision
  metricLengthPrecision: DisplayPrecision
}

export const DEFAULT_IMPERIAL_PREFERENCES: UnitPreferences = {
  system: 'imperial',
  imperialForm: 'feet-and-inches',
  metricForm: 'millimeters',
  imperialLengthPrecision: { kind: 'fraction', denominator: 8 },
  metricLengthPrecision: { kind: 'decimal-places', places: 0 },
}

export const DEFAULT_METRIC_PREFERENCES: UnitPreferences = {
  ...DEFAULT_IMPERIAL_PREFERENCES,
  system: 'metric',
}

// Preferences are loaded from persisted project data, so the form/precision pairing
// is validated at runtime: only feet-and-inches can use a fraction precision, every
// other form is decimal-only. This narrows the precision to its decimal-places member
// and throws when the persisted data pairs a fraction with a decimal-only form.
function requireDecimalPlaces(precision: DisplayPrecision): {
  kind: 'decimal-places'
  places: number
} {
  if (precision.kind === 'fraction') {
    throw new Error(
      'expected decimal-places precision for this form, received a fraction precision',
    )
  }
  return precision
}

/** Resolves the active system's form and precision into explicit format options. */
export function lengthFormatOptions(preferences: UnitPreferences): FormatLengthOptions {
  if (preferences.system === 'metric') {
    return {
      system: 'metric',
      form: preferences.metricForm,
      precision: requireDecimalPlaces(preferences.metricLengthPrecision),
    }
  }
  if (preferences.imperialForm === 'feet-and-inches') {
    // feet-and-inches passes the full DisplayPrecision through unchanged; it is the
    // only form that accepts a fraction precision.
    return {
      system: 'imperial',
      form: 'feet-and-inches',
      precision: preferences.imperialLengthPrecision,
    }
  }
  return {
    system: 'imperial',
    form: preferences.imperialForm,
    precision: requireDecimalPlaces(preferences.imperialLengthPrecision),
  }
}
