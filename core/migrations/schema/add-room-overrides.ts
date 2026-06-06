import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-1 document forward to version 2, which introduces the
 * optional top-level `roomOverrides` map.
 *
 * The map is optional and the room-override merge treats an absent map
 * identically to an empty one, so this migration is structural: it returns the
 * document data unchanged (it does not invent a `roomOverrides` map). The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addRoomOverridesMigration: SchemaMigration = {
  from: 1,
  migrate(project: ProjectShape): ProjectShape {
    return project
  },
}
