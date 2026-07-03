import type { Vector3 } from '../scene/vector3'
import type { SolarAngles } from './solar-position'

/**
 * Unit world-space direction pointing from the scene toward the sun. The solar
 * azimuth is radians clockwise from true north, and `northBearing` is the site
 * north bearing: radians from plan-up to true north, counterclockwise-positive
 * in the y-up plan frame. Subtracting the bearing gives the sun's heading from
 * plan-up, which the plan-to-world convention (plan +y to world -Z, world +Y
 * up; ADR-0139) turns into world axes: heading 0 points down world -Z, heading
 * pi/2 points down world +X. The result is unit length by construction.
 *
 * @param angles Solar azimuth and altitude in radians (see `SolarAngles`).
 * @param northBearing Site north bearing in radians, plan-up to true north,
 *   counterclockwise-positive in the y-up plan frame.
 */
export function sunWorldDirection(angles: SolarAngles, northBearing: number): Vector3 {
  const heading = angles.azimuth - northBearing
  const horizontalReach = Math.cos(angles.altitude)
  return {
    x: horizontalReach * Math.sin(heading),
    y: Math.sin(angles.altitude),
    z: -horizontalReach * Math.cos(heading),
  }
}
