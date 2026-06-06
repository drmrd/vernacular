import type { Millimeters } from './length-units'
import { centimetersToMillimeters, metersToMillimeters } from './length-units'

// Each key is a lowercased unit token; the canonical value is already millimeters,
// so the millimeter forms are an identity conversion with no scaling needed.
const METRIC_PARSERS: Record<string, (value: number) => Millimeters> = {
  mm: (value) => value,
  millimeter: (value) => value,
  millimeters: (value) => value,
  cm: centimetersToMillimeters,
  centimeter: centimetersToMillimeters,
  centimeters: centimetersToMillimeters,
  m: metersToMillimeters,
  meter: metersToMillimeters,
  meters: metersToMillimeters,
}

// Matches a signed decimal magnitude, optional space, then a letter unit token.
const METRIC_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/

export function parseLength(input: string): Millimeters {
  const trimmed = input.trim()
  const match = trimmed.match(METRIC_PATTERN)
  if (match === null) {
    throw new Error(`Unrecognized length value: "${input}"`)
  }
  // The two capture groups are always present once the pattern matches, but
  // noUncheckedIndexedAccess types them as possibly undefined, so guard once.
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
