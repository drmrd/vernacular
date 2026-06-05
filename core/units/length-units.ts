/** A length in real-valued millimeters: the canonical storage unit, matching core/model. */
export type Millimeters = number

export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = 304.8
export const MM_PER_CENTIMETER = 10
export const MM_PER_METER = 1000

// Integer-scaled because 25.4 and 304.8 are not exactly representable in IEEE-754;
// scaling by whole integers keeps exact inputs (80 in, 6 ft) exact on output.
export function inchesToMillimeters(inches: number): Millimeters {
  return (inches * 254) / 10
}

export function millimetersToInches(mm: Millimeters): number {
  return (mm * 10) / 254
}

export function feetToMillimeters(feet: number): Millimeters {
  return (feet * 3048) / 10
}

export function millimetersToFeet(mm: Millimeters): number {
  return (mm * 10) / 3048
}

// The metric factors are exact integers, but a decimal input such as 2.03 is not
// exactly representable, so the bare product drifts (2.03 * 1000 is 2029.9999...).
// Snapping to 15 significant digits removes that sub-ULP noise while preserving
// genuine precision (2.032 stays 2.032).
function snapToExactDecimal(value: number): number {
  return Number(value.toPrecision(15))
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
