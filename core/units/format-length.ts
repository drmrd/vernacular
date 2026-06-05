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

// Splits a length into its sign, whole feet, and inch remainder. Math.abs makes
// totalInches the magnitude, so feet and remainderInches stay >= 0; formatting the
// magnitude and reapplying the sign later keeps the foot/inch split and the rounding
// carry from ever having to reason about a negative value. That invariant also lets the
// inch-part guards test "the part is non-empty" without tracing the sign.
function splitInchesFromMillimeters(mm: Millimeters): {
  isNegative: boolean
  feet: number
  remainderInches: number
} {
  const isNegative = mm < 0
  const totalInches = Math.abs(millimetersToInches(mm))
  const feet = Math.floor(totalInches / INCHES_PER_FOOT)
  const remainderInches = totalInches - feet * INCHES_PER_FOOT
  return { isNegative, feet, remainderInches }
}

// Rounding the inch remainder can reach a full foot (e.g. 11.97" rounds to 12"); carry
// it up so the result reads 1'0" rather than 0'12".
function carryFullFoot(feet: number, inches: number): { feet: number; inches: number } {
  if (inches >= INCHES_PER_FOOT) {
    return { feet: feet + 1, inches: 0 }
  }
  return { feet, inches }
}

// Joins the foot part and the already-formatted inch part into a reading, falling back
// to 0" when the length is zero. The sign is applied only for a non-zero magnitude so
// -0 mm does not print as -0".
function assembleFeetAndInches(isNegative: boolean, feet: number, inchPart: string): string {
  const feetPart = feet > 0 ? `${feet}${FOOT_SYMBOL}` : ''
  const combined = feetPart + inchPart
  const body = combined.length > 0 ? combined : `0${INCH_SYMBOL}`
  return isNegative && combined.length > 0 ? `-${body}` : body
}

function formatFeetAndInchesDecimal(mm: Millimeters, places: number): string {
  const { isNegative, feet, remainderInches } = splitInchesFromMillimeters(mm)
  const carried = carryFullFoot(feet, roundToDecimalPlaces(remainderInches, places))
  const inchPart = carried.inches !== 0 ? `${carried.inches.toFixed(places)}${INCH_SYMBOL}` : ''
  return assembleFeetAndInches(isNegative, carried.feet, inchPart)
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
  const { isNegative, feet, remainderInches } = splitInchesFromMillimeters(mm)
  const fraction = roundToNearestFraction(remainderInches, denominator)
  const carried = carryFullFoot(feet, fraction.whole)
  const inchPart = formatFractionalInchPart(
    carried.inches,
    fraction.numerator,
    fraction.denominator,
  )
  return assembleFeetAndInches(isNegative, carried.feet, inchPart)
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
