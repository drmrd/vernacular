import { pointInPolygon } from '../geometry/polygon'
import { pointOnSegment, segmentIntersection } from '../geometry/segment'
import { shift, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'
import type { ExteriorWall } from './exterior-walls'
import type { FurnitureSceneNode, WallSceneNode } from './scene-graph'

/**
 * Plan-space gap, in millimeters, between a wall face and a furniture footprint that
 * still reads as "against the wall". Wide enough to absorb a skirting offset or an
 * imprecise drag, and well under typical furniture depths, so a free-standing piece
 * in the middle of a room never attaches.
 */
export const WALL_ATTACHMENT_TOLERANCE_MM = 100

/** The plan-space geometry of one wall: its centerline endpoints and thickness. */
export interface WallPlanSegment {
  start: Point
  end: Point
  thickness: number
}

/**
 * True when a furniture footprint sits against the wall, within `tolerance` of its
 * face, or overlaps its plan segment. The minimum distance between a polygon and a
 * segment that do not cross is always attained at a vertex of one against the body
 * of the other, so the two point-versus-segment sweeps below, plus the crossing and
 * containment checks, cover every case.
 */
export function furnitureAttachedToWall(
  footprintCorners: readonly Point[],
  wall: WallPlanSegment,
  tolerance: number = WALL_ATTACHMENT_TOLERANCE_MM,
): boolean {
  const reach = wall.thickness / 2 + tolerance
  if (footprintCorners.some((corner) => pointOnSegment(corner, wall.start, wall.end, reach))) {
    return true
  }
  if (footprintEdgesReachWall(footprintCorners, wall, reach)) {
    return true
  }
  // No corner in reach and no edge crossing or near an endpoint: the footprint can
  // only touch the wall by containing its centerline outright.
  return pointInPolygon(wall.start, footprintCorners)
}

/** The stretch of the wall centerline from `fromMm` to `toMm`, with the wall's thickness. */
function runSegment(wall: WallSceneNode, run: ExteriorWall): WallPlanSegment {
  const direction = unit(subtract(wall.end, wall.start))
  return {
    start: shift(wall.start, direction, run.fromMm),
    end: shift(wall.start, direction, run.toMm),
    thickness: wall.thickness,
  }
}

/**
 * The exterior runs with their `furnitureIds` filled in: each furniture piece joins the first run
 * (in `exterior` order) whose stretch of the wall centerline, from `fromMm` to `toMm`, with the
 * wall's thickness, it stands against (`furnitureAttachedToWall`). Joining exactly one run means a
 * corner piece never enrolls in two fade targets.
 */
export function withAttachedFurniture(
  exterior: ExteriorWall[],
  walls: WallSceneNode[],
  furniture: FurnitureSceneNode[],
): ExteriorWall[] {
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]))
  const segments = exterior.map((run) => {
    const wall = wallsById.get(run.wallId)
    return wall === undefined ? undefined : runSegment(wall, run)
  })
  const furnitureIdsByRunIndex = new Map<number, string[]>()
  for (const piece of furniture) {
    const hostIndex = segments.findIndex(
      (segment) =>
        segment !== undefined && furnitureAttachedToWall(piece.footprintCorners, segment),
    )
    if (hostIndex >= 0) {
      const ids = furnitureIdsByRunIndex.get(hostIndex) ?? []
      ids.push(piece.id)
      furnitureIdsByRunIndex.set(hostIndex, ids)
    }
  }
  return exterior.map((run, runIndex) => ({
    ...run,
    furnitureIds: furnitureIdsByRunIndex.get(runIndex) ?? [],
  }))
}

/**
 * True when any footprint edge crosses the wall centerline or passes within `reach`
 * of one of its endpoints.
 */
function footprintEdgesReachWall(
  footprintCorners: readonly Point[],
  wall: WallPlanSegment,
  reach: number,
): boolean {
  return footprintCorners.some((corner, index) => {
    const next = footprintCorners[(index + 1) % footprintCorners.length] as Point
    return (
      segmentIntersection(corner, next, wall.start, wall.end) !== null ||
      pointOnSegment(wall.start, corner, next, reach) ||
      pointOnSegment(wall.end, corner, next, reach)
    )
  })
}
