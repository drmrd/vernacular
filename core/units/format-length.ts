import type { ImperialForm, MetricForm, Millimeters } from './length-units'
import {
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
} from './length-units'
import { roundToDecimalPlaces } from './precision'

// Decimal forms only; the dispatch stays exhaustive over what is implemented. Both the
// metric and imperial-decimal arms honour only decimal-places precision. A later task adds
// the imperial feet-and-inches arm with its own fraction-capable precision.
type DecimalPrecision = { kind: 'decimal-places'; places: number }

type ImperialDecimalForm = Exclude<ImperialForm, 'feet-and-inches'>

export type FormatLengthOptions =
  | { system: 'imperial'; form: ImperialDecimalForm; precision: DecimalPrecision }
  | { system: 'metric'; form: MetricForm; precision: DecimalPrecision }

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

// Imperial decimal symbols abut the value with no leading space, matching trade
// notation: 6.667' and 80".
const FOOT_SYMBOL = "'"
const INCH_SYMBOL = '"'

function formatDecimal(value: number, places: number, suffix: string): string {
  // toFixed alone rounds half to even at the boundary; round first so the displayed
  // digits match the project's half-away-from-zero rounding helper.
  const rounded = roundToDecimalPlaces(value, places)
  return `${rounded.toFixed(places)}${suffix}`
}

export function formatLength(mm: Millimeters, options: FormatLengthOptions): string {
  const { places } = options.precision
  if (options.system === 'metric') {
    return formatDecimal(METRIC_CONVERSION[options.form](mm), places, METRIC_SYMBOL[options.form])
  }
  if (options.form === 'decimal-feet') {
    return formatDecimal(millimetersToFeet(mm), places, FOOT_SYMBOL)
  }
  return formatDecimal(millimetersToInches(mm), places, INCH_SYMBOL)
}
