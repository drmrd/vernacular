const HALF_TURN_DEGREES = 180

/** Converts an angle from degrees to radians. */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN_DEGREES
}

/** Converts an angle from radians to degrees. */
export function toDegrees(radians: number): number {
  return (radians * HALF_TURN_DEGREES) / Math.PI
}
