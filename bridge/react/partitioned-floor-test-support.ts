import { createWall } from '../../core'
import type { Wall } from '../../core'

// The wall fixture the dispose tests share: a rectangle split by a partition, so a floor derives
// two rooms and an edit can rebuild one of them while the other keeps its group.

export const HEIGHT_MM = 3000
export const RIGHT_MM = 6000
export const WIDENED_RIGHT_MM = 9000
export const PARTITION_X_MM = 3000
const WIDENED_WALL_IDS = ['wall-right', 'wall-bottom', 'wall-top']

/**
 * A rectangle from the origin to `rightX` split by a partition at PARTITION_X_MM. Wall ids are
 * `${idPrefix}bottom`, `top`, `left`, `right`, and `partition`; the default prefix is `wall-`.
 */
export function partitionedWalls(rightX: number, idPrefix = 'wall-'): Wall[] {
  const id = (name: string): { id: string } => ({ id: `${idPrefix}${name}` })
  return [
    createWall({ x: 0, y: 0 }, { x: rightX, y: 0 }, id('bottom')),
    createWall({ x: 0, y: HEIGHT_MM }, { x: rightX, y: HEIGHT_MM }, id('top')),
    createWall({ x: 0, y: 0 }, { x: 0, y: HEIGHT_MM }, id('left')),
    createWall({ x: rightX, y: 0 }, { x: rightX, y: HEIGHT_MM }, id('right')),
    createWall({ x: PARTITION_X_MM, y: 0 }, { x: PARTITION_X_MM, y: HEIGHT_MM }, id('partition')),
  ]
}

/**
 * Widens only the right room of a default-prefix partitioned floor: the three walls around it are
 * replaced, the left wall and the partition keep their references, so the left room's slab and
 * group are reused.
 */
export function widenedWalls(walls: Wall[]): Wall[] {
  const widened = partitionedWalls(WIDENED_RIGHT_MM)
  return walls.map((wall) =>
    WIDENED_WALL_IDS.includes(wall.id) ? (widened.find((w) => w.id === wall.id) ?? wall) : wall,
  )
}
