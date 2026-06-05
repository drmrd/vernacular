import type { ImperialForm, MetricForm, Millimeters } from './length-units'
import {
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
} from './length-units'
import { roundToDecimalPlaces } from './precision'

// Every implemented form honours only decimal-places precision for now. A later task
// widens just the feet-and-inches arm to the fraction-capable DisplayPrecision.
type DecimalPrecision = { kind: 'decimal-places'; places: number }

type ImperialDecimalForm = Exclude<ImperialForm, 'feet-and-inches'>

export type FormatLengthOptions =
  | { system: 'imperial'; form: 'feet-and-inches'; precision: DecimalPrecision }
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

const INCHES_PER_FOOT = 12

function formatDecimal(value: number, places: number, suffix: string): string {
  // toFixed alone rounds half to even at the boundary; round first so the displayed
  // digits match the project's half-away-from-zero rounding helper.
  const rounded = roundToDecimalPlaces(value, places)
  return `${rounded.toFixed(places)}${suffix}`
}

function formatFeetAndInches(mm: Millimeters, places: number): string {
  // Format the magnitude and reapply the sign around it so the foot/inch split and
  // the rounding carry never have to reason about a negative value.
  const isNegative = mm < 0
  const totalInches = Math.abs(millimetersToInches(mm))
  let feet = Math.floor(totalInches / INCHES_PER_FOOT)
  let inches = roundToDecimalPlaces(totalInches - feet * INCHES_PER_FOOT, places)
  // Rounding the inch remainder can reach a full foot (e.g. 11.97" at 0 places rounds
  // to 12"); carry it up so the result reads 1'0" rather than 0'12".
  if (inches >= INCHES_PER_FOOT) {
    feet += 1
    inches = 0
  }
  const feetPart = feet > 0 ? `${feet}${FOOT_SYMBOL}` : ''
  const inchPart = inches > 0 ? `${inches.toFixed(places)}${INCH_SYMBOL}` : ''
  // When both parts are empty the length is zero, which reads as 0".
  const body = feetPart + inchPart || `0${INCH_SYMBOL}`
  // Apply the sign only when the magnitude is non-zero so -0 mm does not print as -0".
  return isNegative && (feet > 0 || inches > 0) ? `-${body}` : body
}

export function formatLength(mm: Millimeters, options: FormatLengthOptions): string {
  const { places } = options.precision
  if (options.system === 'metric') {
    return formatDecimal(METRIC_CONVERSION[options.form](mm), places, METRIC_SYMBOL[options.form])
  }
  if (options.form === 'feet-and-inches') {
    return formatFeetAndInches(mm, places)
  }
  if (options.form === 'decimal-feet') {
    return formatDecimal(millimetersToFeet(mm), places, FOOT_SYMBOL)
  }
  return formatDecimal(millimetersToInches(mm), places, INCH_SYMBOL)
}
