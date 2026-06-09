import type { Dimension, Floor, Opening, Wall } from '../model/types'

export interface ClipboardSnapshot {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}

/** Gathers the selected walls, the openings hosted on those walls, and the selected dimensions. */
export function buildClipboardSnapshot(
  floor: Floor,
  entityIds: Iterable<string>,
): ClipboardSnapshot {
  const selectedIds = new Set(entityIds)
  const walls = floor.walls.filter((wall) => selectedIds.has(wall.id))
  const selectedWallIds = new Set(walls.map((wall) => wall.id))
  const openings = floor.openings.filter((opening) => selectedWallIds.has(opening.hostWallId))
  const dimensions = floor.dimensions.filter((dimension) => selectedIds.has(dimension.id))
  return { walls, openings, dimensions }
}
