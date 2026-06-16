import { type FurnitureFootprint, type Point } from '../../core'

export interface FurnitureGhost {
  position: Point
  rotation: number
  footprint: FurnitureFootprint
}

/** Build the placement ghost descriptor from the cursor point, rotation (degrees), and footprint. */
export function furnitureGhostAt(
  point: Point,
  rotation: number,
  footprint: FurnitureFootprint,
): FurnitureGhost {
  return { position: point, rotation, footprint }
}

const FULL_TURN_DEGREES = 360

/** Coarse rotation step (degrees) applied by the R key during placement. */
export const FURNITURE_ROTATION_STEP_DEGREES = 15

/** Add deltaDegrees to rotation and normalize to the [0, 360) range. */
export function rotatedBy(rotation: number, deltaDegrees: number): number {
  return (((rotation + deltaDegrees) % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES
}
