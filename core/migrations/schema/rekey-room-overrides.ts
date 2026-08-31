import type { ProjectShape, SchemaMigration } from '../types'

/** Separator an early build joined a room's bounding wall ids with. */
const DASH_ERA_SEPARATOR = '-'

/** Separator `roomKey` joins a room's bounding wall ids with today. */
const ROOM_KEY_SEPARATOR = '|'

/**
 * Migrates a version-16 document to version 17, rebinding every room override
 * still filed under a dash-era key to the key `roomKey` derives today.
 *
 * An early build keyed `Project.roomOverrides` by the room's sorted bounding wall
 * ids joined with `-`. Wall ids contain `-` themselves, so that key was ambiguous
 * and `roomKey` now joins with `|`; a document written by the early build keeps
 * overrides the room lookup can no longer find. This migration recovers them by
 * segmenting each stored key against the document's wall ids, then re-joining the
 * segments the way `roomKey` does. A key that does not segment matches no wall and
 * is left untouched, so no user data is dropped. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const rekeyRoomOverridesMigration: SchemaMigration = {
  from: 16,
  migrate(project) {
    const overrides = project.roomOverrides
    if (!isRecord(overrides)) return project

    const wallIds = collectWallIds(project)
    const rekeyed: Record<string, unknown> = {}
    let rewroteAnyKey = false
    for (const [storedKey, override] of Object.entries(overrides)) {
      const roomKey = roomKeyFor(storedKey, wallIds)
      if (roomKey !== storedKey) rewroteAnyKey = true
      rekeyed[roomKey] = override
    }
    return rewroteAnyKey ? { ...project, roomOverrides: rekeyed } : project
  },
}

/**
 * The key `roomKey` derives for the room a dash-era key names, or `storedKey`
 * unchanged when it does not segment into known wall ids (so it names no room).
 */
function roomKeyFor(storedKey: string, wallIds: ReadonlySet<string>): string {
  const segments = segmentIntoWallIds(storedKey, wallIds)
  if (segments === undefined) return storedKey
  return [...new Set(segments)].sort().join(ROOM_KEY_SEPARATOR)
}

/**
 * Split a dash-joined key back into wall ids, backtracking because a wall id may
 * itself contain the separator. Returns undefined when no split covers the key.
 */
function segmentIntoWallIds(key: string, wallIds: ReadonlySet<string>): string[] | undefined {
  for (const wallId of wallIds) {
    if (key === wallId) return [wallId]
    if (!key.startsWith(wallId + DASH_ERA_SEPARATOR)) continue
    const remainder = key.slice(wallId.length + DASH_ERA_SEPARATOR.length)
    const rest = segmentIntoWallIds(remainder, wallIds)
    if (rest !== undefined) return [wallId, ...rest]
  }
  return undefined
}

/**
 * Every wall id in the document. A room's walls all sit on one floor, so pooling
 * the floors only widens the vocabulary a stored key is segmented against.
 */
function collectWallIds(project: ProjectShape): Set<string> {
  const wallIds = new Set<string>()
  const floors = project.floors
  if (!Array.isArray(floors)) return wallIds
  for (const floor of floors) {
    const walls = isRecord(floor) ? floor.walls : undefined
    if (!Array.isArray(walls)) continue
    for (const wall of walls) {
      const id = isRecord(wall) ? wall.id : undefined
      if (typeof id === 'string') wallIds.add(id)
    }
  }
  return wallIds
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
