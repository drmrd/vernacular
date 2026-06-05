export type DisplayPrecision =
  | { kind: 'decimal-places'; places: number }
  | { kind: 'fraction'; denominator: number }

const DECIMAL_BASE = 10

/** Rounds half away from zero (symmetric for negatives, unlike Math.round). */
export function roundToDecimalPlaces(value: number, places: number): number {
  const scale = DECIMAL_BASE ** places
  // Math.round rounds half toward +Infinity, so it is asymmetric for negatives
  // (Math.round(-2.5) is -2). Rounding the magnitude and reapplying the sign keeps
  // the magnitude of negative values consistent with their positive counterparts.
  const sign = Math.sign(value)
  return (sign * Math.round(Math.abs(value) * scale)) / scale
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

/**
 * Rounds a non-negative value to the nearest 1/denominator, returns a reduced
 * fraction; numerator may be 0. Sign is the caller's responsibility (formatLength
 * formats the magnitude and applies the sign around it).
 */
export function roundToNearestFraction(
  value: number,
  denominator: number,
): { whole: number; numerator: number; denominator: number } {
  const totalParts = Math.round(value * denominator)
  const whole = Math.floor(totalParts / denominator)
  const numerator = totalParts % denominator

  // A zero numerator has no fraction to display, so report it as 0/1 rather than
  // 0/denominator to avoid a misleading denominator.
  if (numerator === 0) {
    return { whole, numerator: 0, denominator: 1 }
  }

  const divisor = greatestCommonDivisor(numerator, denominator)
  return {
    whole,
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  }
}
