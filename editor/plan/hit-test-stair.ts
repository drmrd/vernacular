import { pointInPolygon, type Point, type StairSceneNode } from '../../core'
import { stairFootprintCorners } from './draw-stair'
import { contentBounds, type Bounds } from './fit'

/**
 * The id of the topmost placed stair whose rotated footprint contains the point,
 * or null. Mirrors `hitTestFurniture`: forward iteration so a later
 * (drawn-on-top) stair wins, with exact footprint containment and no tolerance
 * band, because the footprint is an area rather than a thin line.
 */
export function hitTestStairs(stairs: readonly StairSceneNode[], point: Point): string | null {
  let hitId: string | null = null
  for (const stair of stairs) {
    if (pointInPolygon(point, stairFootprintCorners(stair))) {
      hitId = stair.id
    }
  }
  return hitId
}

/** Axis-aligned bounds spanning a stair's four rotated footprint corners. */
export function stairBounds(stair: StairSceneNode): Bounds {
  const bounds = contentBounds(stairFootprintCorners(stair))
  if (bounds === null) {
    throw new Error('cannot compute bounds of an empty point set')
  }
  return bounds
}
