import { WALL_NODE_PREFIX, type SurfaceRef } from '../../core'

/**
 * The first paintable face of the one selected wall, or null when the selection is
 * not a single wall. Selecting one wall on the plan defaults the active paint
 * surface to that wall's left face; a multi-select or a non-wall selection leaves
 * the active surface untouched.
 */
export function wallFaceForSelection(selectedIds: ReadonlySet<string>): SurfaceRef | null {
  if (selectedIds.size !== 1) {
    return null
  }
  const [id] = selectedIds
  if (id === undefined || !id.startsWith(WALL_NODE_PREFIX)) {
    return null
  }
  return { kind: 'wall-face', wallId: id.slice(WALL_NODE_PREFIX.length), side: 'left' }
}
