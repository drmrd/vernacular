// Shared positivity and range guard for millimetre dimensions. Command handlers
// call it before storing a value so out-of-range geometry never commits. The
// 100 m ceiling matches the MAX_DIMENSION_MM precedent in
// core/assets/pack-manifest.ts so the inspector and the pack validator agree on
// what a sane millimetre dimension is.

/** The smallest accepted dimension (1 mm); the guard rejects anything below it. */
export const MIN_POSITIVE_LENGTH_MM = 1

/** The absurd-max ceiling (100 m); the guard rejects anything above it. */
export const MAX_LENGTH_MM = 100_000

/** A dimension fell outside the accepted positive-length range. */
export class InvalidLengthError extends Error {
  constructor(
    public readonly label: string,
    public readonly valueMm: number,
  ) {
    super(`${label} must be a positive length up to 100 m`)
    this.name = 'InvalidLengthError'
  }
}

/**
 * Throw InvalidLengthError when `valueMm` is not a finite positive length within
 * the accepted range; otherwise return.
 */
export function assertPositiveLength(valueMm: number, label: string): void {
  if (!Number.isFinite(valueMm) || valueMm < MIN_POSITIVE_LENGTH_MM || valueMm > MAX_LENGTH_MM) {
    throw new InvalidLengthError(label, valueMm)
  }
}

/**
 * Throw InvalidLengthError when `valueMm` is not a finite non-negative length
 * within the accepted range; otherwise return. Allows 0 (for example an opening
 * sill that sits on the floor) while still rejecting negatives and the absurd-max.
 */
export function assertNonNegativeLength(valueMm: number, label: string): void {
  if (!Number.isFinite(valueMm) || valueMm < 0 || valueMm > MAX_LENGTH_MM) {
    throw new InvalidLengthError(label, valueMm)
  }
}
