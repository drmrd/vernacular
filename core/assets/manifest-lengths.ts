// core/assets/manifest-lengths.ts
//
// The one millimetre-length rule shared by model dimensions and texture tile
// sizes in a pack manifest. A leaf module so both validators can import it.

import { MAX_LENGTH_MM } from '../units/length-bounds.ts'

export function isPositiveLengthMm(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_LENGTH_MM
}

export function positiveLengthMmProblem(field: string): string {
  return `${field} must be a positive number of millimeters up to ${MAX_LENGTH_MM}`
}
