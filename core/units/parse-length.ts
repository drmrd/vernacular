import type { Millimeters } from './length-units'
import {
  centimetersToMillimeters,
  INCHES_PER_FOOT,
  inchesToMillimeters,
  metersToMillimeters,
} from './length-units'

// The canonical value is already in millimeters, so this is an identity.
const millimetersToMillimeters = (value: number): Millimeters => value

// Each key is a lowercased unit token mapped to its converter into the canonical
// millimeter representation.
const METRIC_PARSERS: Record<string, (value: number) => Millimeters> = {
  mm: millimetersToMillimeters,
  millimeter: millimetersToMillimeters,
  millimeters: millimetersToMillimeters,
  cm: centimetersToMillimeters,
  centimeter: centimetersToMillimeters,
  centimeters: centimetersToMillimeters,
  m: metersToMillimeters,
  meter: metersToMillimeters,
  meters: metersToMillimeters,
}

// Anchored to the full trimmed string so trailing text (e.g. "2 m x 3 m") is
// rejected rather than silently parsed.
const METRIC_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/

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
    return whole + Number(numerator) / Number(denominator)
  }
  return Number(trimmed)
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

export function parseLength(input: string): Millimeters {
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
  throw new Error(`Unrecognized length value: "${input}"`)
}
