import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-9 document forward to version 10, which backfills the
 * per-floor `furniture` array.
 *
 * The array defaults to `[]` only when it is absent, preserving any
 * already-present array unchanged. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addFloorFurnitureMigration: SchemaMigration = {
  from: 9,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) {
      return project
    }
    const migratedFloors = floors.map((floor) => {
      const floorRecord = floor as Record<string, unknown>
      return {
        ...floorRecord,
        furniture: Array.isArray(floorRecord.furniture) ? floorRecord.furniture : [],
      }
    })
    return { ...project, floors: migratedFloors } satisfies ProjectShape
  },
}
