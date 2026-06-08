import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-2 document forward to version 3, which backfills the
 * per-floor `openings` array (and defensively the `underlays` array the
 * underlay slice added without its own version bump).
 *
 * Each array defaults to `[]` only when it is absent, preserving any
 * already-present array unchanged. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addFloorOpeningsMigration: SchemaMigration = {
  from: 2,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) {
      return project
    }
    const migratedFloors = floors.map((floor) => {
      const floorRecord = floor as Record<string, unknown>
      return {
        ...floorRecord,
        openings: Array.isArray(floorRecord.openings) ? floorRecord.openings : [],
        underlays: Array.isArray(floorRecord.underlays) ? floorRecord.underlays : [],
      }
    })
    return { ...project, floors: migratedFloors } satisfies ProjectShape
  },
}
