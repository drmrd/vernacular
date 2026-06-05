import type { MetricForm, Millimeters } from './length-units'
import { millimetersToCentimeters, millimetersToMeters } from './length-units'
import type { DisplayPrecision } from './precision'
import { roundToDecimalPlaces } from './precision'

// Metric-only for now; a later task widens this into a discriminated union with an
// imperial variant.
export type FormatLengthOptions = {
  system: 'metric'
  form: MetricForm
  precision: DisplayPrecision
}

// en-US unit symbols with a leading space so the value and symbol read as "2.03 m".
const METRIC_SYMBOL: Record<MetricForm, string> = {
  meters: ' m',
  centimeters: ' cm',
  millimeters: ' mm',
}

const METRIC_CONVERSION: Record<MetricForm, (mm: Millimeters) => number> = {
  meters: millimetersToMeters,
  centimeters: millimetersToCentimeters,
  // The canonical value is already in millimeters, so this form needs no conversion.
  millimeters: (mm) => mm,
}

export function formatLength(mm: Millimeters, options: FormatLengthOptions): string {
  // Metric forms carry decimal-places precision; a fraction precision on metric is
  // rejected in a later task.
  const { places } = options.precision as { kind: 'decimal-places'; places: number }
  const converted = METRIC_CONVERSION[options.form](mm)
  // toFixed alone rounds half to even at the boundary; round first so the displayed
  // digits match the project's half-away-from-zero rounding helper.
  const rounded = roundToDecimalPlaces(converted, places)
  return `${rounded.toFixed(places)}${METRIC_SYMBOL[options.form]}`
}
