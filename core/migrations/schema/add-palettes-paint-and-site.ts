import type { SchemaMigration } from '../types'

/**
 * Migrates a version-7 document forward to version 8. Version 8 adds the optional
 * top-level `palettes`, `paint`, and `site` fields. All three are
 * absent-by-default, and an absent optional field is treated identically to an
 * unset one, so no data work is needed: the migration is a structural
 * pass-through. The version bump records that this build understands the fields.
 * The orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addPalettesPaintAndSiteMigration: SchemaMigration = {
  from: 7,
  migrate(project) {
    return project
  },
}
