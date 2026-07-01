import type { Point } from '../model/types'
import { pointInPolygon } from '../geometry/polygon'

/**
 * Reports whether a floor-plan-space viewpoint sits inside the building, meaning
 * it falls within at least one room polygon. This backs suppressing the near-wall
 * transparency fade while the viewer stands indoors: a viewer already inside the
 * footprint should see solid walls rather than have the nearest one fade away.
 *
 * @param planPoint The viewpoint, in plan millimeters (see the `Point` type).
 * @param roomPolygons The floor's room outlines, in plan millimeters. An empty
 *   set reports the point as outside.
 */
export function isInteriorViewpoint(
  planPoint: Point,
  roomPolygons: readonly (readonly Point[])[],
): boolean {
  return roomPolygons.some((polygon) => pointInPolygon(planPoint, polygon))
}
