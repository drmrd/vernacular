import type { Point } from '../model/types'
import { isInteriorViewpoint } from './interior-viewpoint'

/**
 * Reports whether the near-wall transparency fade should run for a given
 * viewpoint. The fade engages only when the caller's view mode enables it AND
 * the viewpoint sits outside the building. A viewer already indoors should see
 * solid walls rather than have the nearest one fade away, so this suppresses the
 * fade whenever the orbit camera is dollied inside the footprint, alongside the
 * existing walk-mode restore. Composes {@link isInteriorViewpoint} for the
 * boundary-inclusive inside test, so a point exactly on a room edge counts as
 * indoors and keeps the walls solid.
 *
 * @param enabled Whether the caller's view mode enables the near-wall fade.
 * @param planPoint The viewpoint, in plan millimeters.
 * @param roomPolygons The floor's room outlines, in plan millimeters. An empty
 *   set reports the point as outside, so the fade engages when enabled.
 */
export function nearWallFadeEngaged(
  enabled: boolean,
  planPoint: Point,
  roomPolygons: readonly (readonly Point[])[],
): boolean {
  return enabled && !isInteriorViewpoint(planPoint, roomPolygons)
}
