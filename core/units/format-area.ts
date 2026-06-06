import { MM_PER_FOOT, MM_PER_METER } from './length-units'
import { roundToDecimalPlaces } from './precision'
import type { UnitPreferences } from './preferences'

// Area is the square of a length, so the millimeters-per-unit factors are squared to
// convert square millimeters into square meters or square feet.
const AREA_EXPONENT = 2

// Metric area shows one decimal place; imperial area shows whole square feet.
const METRIC_AREA_DECIMALS = 1
const IMPERIAL_AREA_DECIMALS = 0

// en-US unit symbols with a leading space so the value and symbol read as "12.5 m²".
// The superscript two is unicode U+00B2.
const SQUARE_METER_SYMBOL = ' m²'
const SQUARE_FOOT_SYMBOL = ' ft²'

/** Formats a square-millimeter area for the active unit system. */
export function formatArea(squareMillimeters: number, preferences: UnitPreferences): string {
  if (preferences.system === 'metric') {
    const squareMeters = squareMillimeters / MM_PER_METER ** AREA_EXPONENT
    const rounded = roundToDecimalPlaces(squareMeters, METRIC_AREA_DECIMALS)
    return `${rounded}${SQUARE_METER_SYMBOL}`
  }
  const squareFeet = squareMillimeters / MM_PER_FOOT ** AREA_EXPONENT
  const rounded = roundToDecimalPlaces(squareFeet, IMPERIAL_AREA_DECIMALS)
  return `${rounded}${SQUARE_FOOT_SYMBOL}`
}
