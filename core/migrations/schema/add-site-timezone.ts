import type { SchemaMigration } from '../types'

/**
 * Migrates a version-13 document to version 14. `Site.timezone` is an optional
 * field, so a version-13-and-earlier document simply omits it and is already valid
 * at version 14; this migration is a passthrough. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addSiteTimezoneMigration: SchemaMigration = {
  from: 13,
  migrate(project) {
    return project
  },
}
