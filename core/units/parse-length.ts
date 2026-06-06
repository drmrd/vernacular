import type { Millimeters } from './length-units'
import { centimetersToMillimeters, metersToMillimeters } from './length-units'

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

export function parseLength(input: string): Millimeters {
  const trimmed = input.trim()
  const match = trimmed.match(METRIC_PATTERN)
  if (match === null) {
    throw new Error(`Unrecognized length value: "${input}"`)
  }
  // Both capture groups are mandatory in the pattern, so this second branch is
  // unreachable in practice; it exists only to satisfy noUncheckedIndexedAccess,
  // which types indexed matches as possibly undefined.
  const [, magnitude, unitToken] = match
  if (magnitude === undefined || unitToken === undefined) {
    throw new Error(`Unrecognized length value: "${input}"`)
  }
  const value = Number(magnitude)
  const parser = METRIC_PARSERS[unitToken.toLowerCase()]
  if (parser === undefined) {
    throw new Error(`Unrecognized length unit: "${unitToken}"`)
  }
  return parser(value)
}
