import type { OpeningSceneNode, Point, WallFaceGap } from '../../core'
import { openingJambs, projectPointOntoWall } from './opening-geometry'

/**
 * A wall run that openings are projected onto: its centerline endpoints and the raw
 * wall id an opening names as its host.
 */
export interface HostWallRun {
  start: Point
  end: Point
  /** The raw wall id, without the scene-node prefix, which is what `hostWallId` carries. */
  wallId: string
}

/**
 * The clear spans the openings hosted by `run`'s wall cut out of it, as centerline
 * distances measured from `run.start`.
 *
 * The distances come back unclamped. `wallFaceGeometry` clamps them to the run it
 * is cutting and drops the zero-length result, so an opening sitting on another
 * sub-edge of a wall a tee has split falls out on its own and no caller has to work
 * out which sub-edge hosts which opening.
 */
export function openingSpansAlong(
  run: HostWallRun,
  openings: readonly OpeningSceneNode[],
): WallFaceGap[] {
  return openings
    .filter((opening) => opening.hostWallId === run.wallId)
    .map((opening) => {
      const jambs = openingJambs(opening)
      return {
        from: projectPointOntoWall(run.start, run.end, jambs.start),
        to: projectPointOntoWall(run.start, run.end, jambs.end),
      }
    })
}
