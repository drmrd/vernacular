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
  const wallId = id === undefined ? null : wallIdOf(id)
  return wallId === null ? null : { kind: 'wall-face', wallId, side: 'left' }
}

/** The wall id inside a `wall:` entity id, or null when the entity is not a wall. */
function wallIdOf(entityId: string): string | null {
  return entityId.startsWith(WALL_NODE_PREFIX) ? entityId.slice(WALL_NODE_PREFIX.length) : null
}

/**
 * Whether a paint surface is one of the surfaces of an entity, so a surface that a
 * 3D click already picked on the entity survives the selection change that follows
 * it. A wall owns both of its faces; any other entity owns none that this module knows.
 */
export function isSurfaceOfEntity(surface: SurfaceRef, entityId: string): boolean {
  return surface.kind === 'wall-face' && surface.wallId === wallIdOf(entityId)
}
