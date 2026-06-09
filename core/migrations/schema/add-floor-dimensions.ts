import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-3 document forward to version 4, which backfills the
 * per-floor `dimensions` array. The `openings` and `underlays` arrays already
 * exist at version 3, so only `dimensions` needs a default here.
 *
 * The array defaults to `[]` only when it is absent, preserving any
 * already-present array unchanged. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addFloorDimensionsMigration: SchemaMigration = {
  from: 3,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) {
      return project
    }
    const migratedFloors = floors.map((floor) => {
      const floorRecord = floor as Record<string, unknown>
      return {
        ...floorRecord,
        dimensions: Array.isArray(floorRecord.dimensions) ? floorRecord.dimensions : [],
      }
    })
    return { ...project, floors: migratedFloors } satisfies ProjectShape
  },
}
