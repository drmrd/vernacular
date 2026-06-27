import { pointInPolygon, type Point, type UnderlaySceneNode } from '../../core'
import { underlayTracePoints } from './underlay-trace-points'

/**
 * The id of the topmost visible underlay whose rotated footprint contains the
 * point, or null. Mirrors `hitTestFurniture`: forward iteration so a later
 * (drawn-on-top) underlay wins, with exact footprint containment and no tolerance
 * band. Hidden underlays are not pickable, so they are skipped.
 */
export function hitTestUnderlay(
  underlays: readonly UnderlaySceneNode[],
  point: Point,
): string | null {
  let hitId: string | null = null
  for (const underlay of underlays) {
    if (underlay.visible && pointInPolygon(point, underlayTracePoints(underlay))) {
      hitId = underlay.id
    }
  }
  return hitId
}
