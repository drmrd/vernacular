import type { SchemaMigration } from '../types'

/**
 * Migrates a version-15 document to version 16. `WeatherConditions.cloudCover` is an
 * optional field, so a version-15-and-earlier document simply omits it and is already
 * valid at version 16; this migration is a passthrough. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addWeatherCloudCoverMigration: SchemaMigration = {
  from: 15,
  migrate(project) {
    return project
  },
}
