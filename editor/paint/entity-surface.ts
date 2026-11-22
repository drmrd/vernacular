import { ROOM_ID_PREFIX, WALL_NODE_PREFIX, type RoomSceneNode, type SurfaceRef } from '../../core'

/** What a selection change does to the active paint surface. */
export type PaintTargetChange =
  | { kind: 'keep' }
  | { kind: 'select'; surface: SurfaceRef }
  | { kind: 'clear' }

/**
 * The paint target a selection implies. One selected wall targets a face of that wall,
 * one selected room targets its floor, and any other single entity has no paintable
 * face, so the target is cleared. An empty or multiple selection, and a room that the
 * scene graph does not hold, leave the active surface as it is. A surface that already
 * belongs to the selected entity is kept.
 */
export function paintTargetForSelection(
  selectedIds: ReadonlySet<string>,
  active: SurfaceRef | null,
  rooms: readonly RoomSceneNode[],
): PaintTargetChange {
  const [entityId] = selectedIds
  if (selectedIds.size !== 1 || entityId === undefined) {
    return { kind: 'keep' }
  }
  if (entityId.startsWith(WALL_NODE_PREFIX)) {
    const keepsActive = active !== null && isSurfaceOfEntity(active, entityId)
    return keepsActive
      ? { kind: 'keep' }
      : {
          kind: 'select',
          surface: {
            kind: 'wall-face',
            wallId: entityId.slice(WALL_NODE_PREFIX.length),
            side: 'left',
          },
        }
  }
  if (entityId.startsWith(ROOM_ID_PREFIX)) {
    return roomPaintTarget(entityId, active, rooms)
  }
  return { kind: 'clear' }
}

function roomPaintTarget(
  roomId: string,
  active: SurfaceRef | null,
  rooms: readonly RoomSceneNode[],
): PaintTargetChange {
  const room = rooms.find((candidate) => candidate.id === roomId)
  if (room === undefined) {
    return { kind: 'keep' }
  }
  const keepsActive =
    (active?.kind === 'floor' || active?.kind === 'ceiling') && active.floorId === room.floorId
  return keepsActive
    ? { kind: 'keep' }
    : { kind: 'select', surface: { kind: 'floor', floorId: room.floorId } }
}

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
