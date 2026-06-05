/** A length in real-valued millimeters: the canonical storage unit, matching core/model. */
export type Millimeters = number

export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = 304.8
export const MM_PER_CENTIMETER = 10
export const MM_PER_METER = 1000

// 25.4 = 254/10 and 304.8 = 3048/10 expressed as integer fractions so integer
// inputs produce exact terminating-decimal outputs (avoids IEEE-754 drift).
const INCHES_NUMERATOR = 254
const FEET_NUMERATOR = 3048
const IMPERIAL_DENOMINATOR = 10

export function inchesToMillimeters(inches: number): Millimeters {
  return (inches * INCHES_NUMERATOR) / IMPERIAL_DENOMINATOR
}

export function millimetersToInches(mm: Millimeters): number {
  return (mm * IMPERIAL_DENOMINATOR) / INCHES_NUMERATOR
}

export function feetToMillimeters(feet: number): Millimeters {
  return (feet * FEET_NUMERATOR) / IMPERIAL_DENOMINATOR
}

export function millimetersToFeet(mm: Millimeters): number {
  return (mm * IMPERIAL_DENOMINATOR) / FEET_NUMERATOR
}

// The metric factors are exact integers, but a decimal input such as 2.03 is not
// exactly representable, so the bare product drifts (2.03 * 1000 is 2029.9999...).
// IEEE-754 double holds ~15.9 significant decimal digits; 15 sig figs removes
// sub-ULP noise without rounding away genuine user-supplied precision.
const SIGNIFICANT_DIGITS_FOR_SNAP = 15

function snapToExactDecimal(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS_FOR_SNAP))
}

export function centimetersToMillimeters(centimeters: number): Millimeters {
  return snapToExactDecimal(centimeters * MM_PER_CENTIMETER)
}

export function millimetersToCentimeters(mm: Millimeters): number {
  return snapToExactDecimal(mm / MM_PER_CENTIMETER)
}

export function metersToMillimeters(meters: number): Millimeters {
  return snapToExactDecimal(meters * MM_PER_METER)
}

export function millimetersToMeters(mm: Millimeters): number {
  return snapToExactDecimal(mm / MM_PER_METER)
}
