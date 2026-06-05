import type { ImperialForm, MetricForm, Millimeters } from './length-units'
import {
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
} from './length-units'
import type { DisplayPrecision } from './precision'
import { roundToDecimalPlaces, roundToNearestFraction } from './precision'

// Only feet-and-inches accepts fractional precision; every other form is decimal-only.
// Encoding that in the union makes an invalid fraction/form pairing a compile error.
type DecimalPrecision = { kind: 'decimal-places'; places: number }

type ImperialDecimalForm = Exclude<ImperialForm, 'feet-and-inches'>

// Arms are ordered to match the dispatch order in formatLength: metric first, then the
// feet-and-inches arm, then the remaining imperial decimal forms.
export type FormatLengthOptions =
  | { system: 'metric'; form: MetricForm; precision: DecimalPrecision }
  | { system: 'imperial'; form: 'feet-and-inches'; precision: DisplayPrecision }
  | { system: 'imperial'; form: ImperialDecimalForm; precision: DecimalPrecision }

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

function formatFeetAndInchesDecimal(mm: Millimeters, places: number): string {
  // Format the magnitude and reapply the sign around it so the foot/inch split and
  // the rounding carry never have to reason about a negative value.
  const isNegative = mm < 0
  // Math.abs makes totalInches the magnitude, so every value derived below (feet, the
  // inch remainder) stays >= 0. That invariant lets the inch-part guard use inches !== 0
  // ("the part is non-empty") without the reader tracing the sign to confirm it equals
  // the older inches > 0 test.
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
  const inchPart = inches !== 0 ? `${inches.toFixed(places)}${INCH_SYMBOL}` : ''
  // When both parts are empty the length is zero, which reads as 0".
  const combined = feetPart + inchPart
  const body = combined.length > 0 ? combined : `0${INCH_SYMBOL}`
  // Apply the sign only when the magnitude is non-zero so -0 mm does not print as -0".
  return isNegative && (feet > 0 || inches > 0) ? `-${body}` : body
}

// Builds the inch portion of a fractional reading: '' when the inch part is empty, a
// bare whole-inch part when the fraction reduces away, a bare fraction when there are
// no whole inches, and "8 1/2"" when both are present.
function formatFractionalInchPart(
  wholeInches: number,
  numerator: number,
  denominator: number,
): string {
  if (wholeInches === 0 && numerator === 0) {
    return ''
  }
  if (numerator === 0) {
    return `${wholeInches}${INCH_SYMBOL}`
  }
  const wholePrefix = wholeInches > 0 ? `${wholeInches} ` : ''
  return `${wholePrefix}${numerator}/${denominator}${INCH_SYMBOL}`
}

function formatFeetAndInchesFraction(mm: Millimeters, denominator: number): string {
  // The denominator originates in user-controlled UnitPreferences, so guard it at this
  // consumer boundary before handing it to roundToNearestFraction (which assumes a
  // positive integer). The message names "positive integer" so the cause is clear.
  if (!Number.isInteger(denominator) || denominator <= 0) {
    throw new Error(`fraction denominator must be a positive integer, got ${denominator}`)
  }
  // Format the magnitude and reapply the sign around it so the foot/inch split and the
  // rounding carry never have to reason about a negative value.
  const isNegative = mm < 0
  const totalInches = Math.abs(millimetersToInches(mm))
  let feet = Math.floor(totalInches / INCHES_PER_FOOT)
  const fraction = roundToNearestFraction(totalInches - feet * INCHES_PER_FOOT, denominator)
  let wholeInches = fraction.whole
  // Rounding the inch remainder can reach a full foot (e.g. 11.97" rounds to 12");
  // carry it up so the result reads 1' rather than 0'12".
  if (wholeInches >= INCHES_PER_FOOT) {
    feet += 1
    wholeInches = 0
  }
  const inchPart = formatFractionalInchPart(wholeInches, fraction.numerator, fraction.denominator)
  const feetPart = feet > 0 ? `${feet}${FOOT_SYMBOL}` : ''
  // When both parts are empty the length is zero, which reads as 0".
  const combined = feetPart + inchPart
  const body = combined.length > 0 ? combined : `0${INCH_SYMBOL}`
  // Apply the sign only when the magnitude is non-zero so -0 mm does not print as -0".
  return isNegative && combined.length > 0 ? `-${body}` : body
}

function formatFeetAndInches(mm: Millimeters, precision: DisplayPrecision): string {
  return precision.kind === 'fraction'
    ? formatFeetAndInchesFraction(mm, precision.denominator)
    : formatFeetAndInchesDecimal(mm, precision.places)
}

export function formatLength(mm: Millimeters, options: FormatLengthOptions): string {
  if (options.system === 'metric') {
    return formatDecimal(
      METRIC_CONVERSION[options.form](mm),
      options.precision.places,
      METRIC_SYMBOL[options.form],
    )
  }
  if (options.form === 'decimal-feet') {
    return formatDecimal(millimetersToFeet(mm), options.precision.places, FOOT_SYMBOL)
  }
  if (options.form === 'decimal-inches') {
    return formatDecimal(millimetersToInches(mm), options.precision.places, INCH_SYMBOL)
  }
  // feet-and-inches: precision is the full DisplayPrecision (decimal or fraction).
  return formatFeetAndInches(mm, options.precision)
}
