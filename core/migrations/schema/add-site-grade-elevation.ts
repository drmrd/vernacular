import type { SchemaMigration } from '../types'

/**
 * Migrates a version-12 document to version 13. `Site.gradeElevation` is an
 * optional field, so a version-12-and-earlier document simply omits it and is
 * already valid at version 13; this migration is a passthrough. The orchestrator
 * advances `meta.schemaVersion`, so the migration must not.
 */
export const addSiteGradeElevationMigration: SchemaMigration = {
  from: 12,
  migrate(project) {
    return project
  },
}
