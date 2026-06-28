// Degrees in a half turn; the conversion factor from radians to degrees.
const DEGREES_PER_HALF_TURN = 180
const DEGREES_PER_RADIAN = DEGREES_PER_HALF_TURN / Math.PI

/**
 * The SVG rotation in degrees that swings the compass needle from plan-up to the
 * site's true north. `northBearingRadians` is the angle from plan-up to true north
 * in the y-up world frame (matching Site.northBearing); the screen frame is y-down,
 * so the sign flips. A zero bearing leaves the needle pointing straight up.
 */
export function compassNeedleRotationDegrees(northBearingRadians: number): number {
  return -northBearingRadians * DEGREES_PER_RADIAN
}
