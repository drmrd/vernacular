import { formatLength, type FormatLengthOptions } from './format-length'
import type { Millimeters } from './length-units'
import type { UnitPreferences } from './preferences'

// At or above one meter, read in meters; at or above one centimeter, read in
// centimeters; below that, read in whole millimeters. The choice is made on the
// magnitude so negatives pick the same form as their positive counterpart.
const METERS_THRESHOLD_MM = 1000
const CENTIMETERS_THRESHOLD_MM = 100

function metricFormatOptions(magnitudeMm: number): FormatLengthOptions {
  if (magnitudeMm >= METERS_THRESHOLD_MM) {
    return { system: 'metric', form: 'meters', precision: { kind: 'decimal-places', places: 2 } }
  }
  if (magnitudeMm >= CENTIMETERS_THRESHOLD_MM) {
    return {
      system: 'metric',
      form: 'centimeters',
      precision: { kind: 'decimal-places', places: 1 },
    }
  }
  return { system: 'metric', form: 'millimeters', precision: { kind: 'decimal-places', places: 0 } }
}

/**
 * Formats a length for display, choosing the metric form (meters, centimeters, or
 * millimeters) by magnitude with category-appropriate precision. Imperial delegates to
 * feet-and-inches using the preferences' imperial precision.
 */
export function formatAdaptiveLength(mm: Millimeters, preferences: UnitPreferences): string {
  if (preferences.system === 'imperial') {
    return formatLength(mm, {
      system: 'imperial',
      form: 'feet-and-inches',
      precision: preferences.imperialLengthPrecision,
    })
  }
  return formatLength(mm, metricFormatOptions(Math.abs(mm)))
}
