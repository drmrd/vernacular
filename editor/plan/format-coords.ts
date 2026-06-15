import { formatAdaptiveLength, type Point, type UnitPreferences } from '../../core'

/**
 * Formats a world point as an `x, y` coordinate readout in the project's units, each
 * axis run through the same adaptive length formatter the rest of the editor uses.
 */
export function formatCoords(world: Point, preferences: UnitPreferences): string {
  return `${formatAdaptiveLength(world.x, preferences)}, ${formatAdaptiveLength(world.y, preferences)}`
}
