import { type Point, type Wall } from '../../core'
import { projectPointOntoWall } from './opening-geometry'

/** The along-wall position (mm from the host wall start) of `world` projected onto the host wall. */
export function openingDragPosition(hostWall: Wall, world: Point): number {
  return projectPointOntoWall(hostWall.start, hostWall.end, world)
}
