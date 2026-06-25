import type { Millimeters } from './length-units'
import {
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
} from './length-units'
import type { AssumedUnit } from './parse-length'
import { roundToDecimalPlaces } from './precision'

// The canonical millimeter value is already in millimeters, so its converter is identity.
const millimetersToMillimeters = (mm: Millimeters): number => mm

// Per-unit maximum decimal places for a bare data-entry magnitude.
const DECIMAL_PLACES: Record<AssumedUnit, number> = {
  mm: 0,
  cm: 1,
  m: 3,
  in: 2,
  ft: 3,
}

const CONVERTERS: Record<AssumedUnit, (mm: Millimeters) => number> = {
  mm: millimetersToMillimeters,
  cm: millimetersToCentimeters,
  m: millimetersToMeters,
  in: millimetersToInches,
  ft: millimetersToFeet,
}

/**
 * Expresses the canonical millimeter value as a bare decimal magnitude string in
 * the given unit (no unit suffix), rounded to the unit's maximum decimal places
 * and stripped of trailing zeros and any trailing decimal point.
 */
export function formatEntryMagnitude(mm: Millimeters, unit: AssumedUnit): string {
  const places = DECIMAL_PLACES[unit]
  const rounded = roundToDecimalPlaces(CONVERTERS[unit](mm), places)
  // toFixed avoids float noise at the chosen precision, then Number() drops any
  // trailing zeros and the trailing decimal point that toFixed would leave behind.
  return Number(rounded.toFixed(places)).toString()
}
