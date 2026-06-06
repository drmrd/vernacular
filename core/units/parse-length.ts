import type { Millimeters } from './length-units'
import {
  centimetersToMillimeters,
  feetToMillimeters,
  INCHES_PER_FOOT,
  inchesToMillimeters,
  metersToMillimeters,
} from './length-units'

// The unit a caller may assume for a bare number that carries no unit token.
export type AssumedUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft'

export interface ParseLengthOptions {
  /** Unit assumed for a bare number with no unit token. Omitted means a bare number throws. */
  assumeUnit?: AssumedUnit
}

// The canonical value is already in millimeters, so this is an identity.
const millimetersToMillimeters = (value: number): Millimeters => value

// The one place the metric converter choice lives. Both METRIC_PARSERS (token
// lookup) and ASSUMED_UNIT_CONVERTERS (assumed-unit lookup) build from this.
const METRIC_CONVERTERS: Record<'mm' | 'cm' | 'm', (value: number) => Millimeters> = {
  mm: millimetersToMillimeters,
  cm: centimetersToMillimeters,
  m: metersToMillimeters,
}

// Each key is a lowercased unit token mapped to its converter into the canonical
// millimeter representation.
const METRIC_PARSERS: Record<string, (value: number) => Millimeters> = {
  mm: METRIC_CONVERTERS.mm,
  millimeter: METRIC_CONVERTERS.mm,
  millimeters: METRIC_CONVERTERS.mm,
  cm: METRIC_CONVERTERS.cm,
  centimeter: METRIC_CONVERTERS.cm,
  centimeters: METRIC_CONVERTERS.cm,
  m: METRIC_CONVERTERS.m,
  meter: METRIC_CONVERTERS.m,
  meters: METRIC_CONVERTERS.m,
}

// Anchored to the full trimmed string so trailing text (e.g. "2 m x 3 m") is
// rejected rather than silently parsed.
const METRIC_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/

// A bare number with no unit token; interpreted only when a caller supplies assumeUnit.
const BARE_NUMBER = /^-?\d+(?:\.\d+)?$/

// The canonical millimeter converter for each assumable unit. The metric units
// reuse METRIC_CONVERTERS so the mm/cm/m converter choice lives in one place.
const ASSUMED_UNIT_CONVERTERS: Record<AssumedUnit, (value: number) => Millimeters> = {
  mm: METRIC_CONVERTERS.mm,
  cm: METRIC_CONVERTERS.cm,
  m: METRIC_CONVERTERS.m,
  in: inchesToMillimeters,
  ft: feetToMillimeters,
}

// A leading sign, then an optional feet component and an optional inch component.
// Both components are optional individually so notations like "6'", "80\"", and
// "6'8\"" all match; the caller requires at least one to have matched. The order is
// significant: the feet component must precede the inch component if both are present,
// so reversed input like "8\" 6'" is rejected by design (it falls through to the throw).
// The inch group captures raw text non-greedily (digits, dots, slashes, spaces, hyphens)
// because the inch value may be a decimal or a mixed/bare fraction; parseInchValueText
// interprets that text separately. Feet stays a plain decimal number.
const IMPERIAL_PATTERN =
  /^(-?)\s*(?:(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|'))?\s*(?:([\d./\s-]+?)\s*(?:inches|inch|in|"))?$/i

function buildMetric(match: RegExpMatchArray): Millimeters {
  // Both capture groups are mandatory in METRIC_PATTERN, so the undefined branch is
  // unreachable in practice; it exists only to satisfy noUncheckedIndexedAccess,
  // which types indexed matches as possibly undefined.
  const [, magnitude, unitToken] = match
  if (magnitude === undefined || unitToken === undefined) {
    throw new Error(`Unrecognized length value: "${match[0]}"`)
  }
  const value = Number(magnitude)
  const parser = METRIC_PARSERS[unitToken.toLowerCase()]
  if (parser === undefined) {
    throw new Error(`Unrecognized length unit: "${unitToken}"`)
  }
  return parser(value)
}

// Converts the captured inch-value text to a number of inches. The text may be a
// decimal ("8.5"), a mixed fraction ("8 1/2" or "8-1/2"), or a bare fraction ("1/2"),
// so a plain Number() is not enough; the whole part of a mixed fraction is optional.
function parseInchValueText(text: string): number {
  const trimmed = text.trim()
  const fraction = trimmed.match(/^(?:(\d+(?:\.\d+)?)[\s-])?(\d+)\/(\d+)$/)
  if (fraction) {
    const [, wholeText, numerator, denominator] = fraction
    const whole = wholeText === undefined ? 0 : Number(wholeText)
    // Guard before dividing so a zero denominator surfaces as a clear error
    // rather than an Infinity result.
    if (Number(denominator) === 0) {
      throw new Error(`Fraction denominator cannot be zero: "${text}"`)
    }
    return whole + Number(numerator) / Number(denominator)
  }
  const value = Number(trimmed)
  // A malformed inch value (e.g. "8 1") parses to NaN; reject it rather than
  // propagating NaN through the conversion.
  if (Number.isNaN(value)) {
    throw new Error(`Unrecognized inch value: "${text}"`)
  }
  return value
}

function buildImperial(match: RegExpMatchArray): Millimeters {
  const [, sign, feetText, inchText] = match
  const feet = feetText === undefined ? 0 : Number(feetText)
  const inches = inchText === undefined ? 0 : parseInchValueText(inchText)
  // Convert via total inches (feet*12 + inches) so an exact value like 6'8" stays
  // exactly 2032 rather than drifting from adding two separately-rounded products.
  const magnitude = inchesToMillimeters(feet * INCHES_PER_FOOT + inches)
  return sign === '-' ? -magnitude : magnitude
}

// A bare number has no unit, so it is only meaningful when the caller names the
// unit to assume; otherwise it is ambiguous and rejected. The input is passed through
// for the error message so the caller sees the original, untrimmed text.
function applyAssumedUnit(text: string, options: ParseLengthOptions, input: string): Millimeters {
  if (options.assumeUnit === undefined) {
    throw new Error(`Length needs a unit or an assumeUnit option: "${input}"`)
  }
  return ASSUMED_UNIT_CONVERTERS[options.assumeUnit](Number(text))
}

export function parseLength(input: string, options: ParseLengthOptions = {}): Millimeters {
  const trimmed = input.trim()
  const imperial = trimmed.match(IMPERIAL_PATTERN)
  if (imperial) {
    // The imperial pattern's parts are both optional, so require at least one to have
    // matched (otherwise an empty or sign-only string would falsely match as zero).
    const [, , feetText, inchText] = imperial
    if (feetText !== undefined || inchText !== undefined) {
      return buildImperial(imperial)
    }
  }
  const metric = trimmed.match(METRIC_PATTERN)
  if (metric) {
    return buildMetric(metric)
  }
  if (BARE_NUMBER.test(trimmed)) {
    return applyAssumedUnit(trimmed, options, input)
  }
  throw new Error(`Unrecognized length value: "${input}"`)
}
