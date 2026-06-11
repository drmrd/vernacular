import { rotatePoint } from '../geometry/point'
import type { Point, Stair } from '../model/types'

/** The plan-space rectangle a stair's footprint occupies, as a closed 4-point
 * polygon (the stairwell void on the upper floor): width across x, length along
 * y, anchored at the stair position and rotated about it by the stair rotation. */
export function stairWellPolygon(stair: Stair): Point[] {
  const corners: Point[] = [
    { x: stair.position.x, y: stair.position.y },
    { x: stair.position.x + stair.width, y: stair.position.y },
    { x: stair.position.x + stair.width, y: stair.position.y + stair.length },
    { x: stair.position.x, y: stair.position.y + stair.length },
  ]
  return corners.map((corner) => rotatePoint(corner, stair.position, stair.rotation))
}
