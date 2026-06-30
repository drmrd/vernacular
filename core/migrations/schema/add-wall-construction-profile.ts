import type { SchemaMigration } from '../types'

/**
 * Migrates a version-11 document to version 12. `Wall.constructionProfile` is an
 * optional registry-id alias, so a version-11-and-earlier wall simply omits it and
 * is already valid at version 12; this migration is a passthrough. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addWallConstructionProfileMigration: SchemaMigration = {
  from: 11,
  migrate(project) {
    return project
  },
}
