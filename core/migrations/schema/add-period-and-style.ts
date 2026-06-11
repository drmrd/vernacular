import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-4 document forward to version 5. Version 5 renames the
 * project `meta.era` field to `meta.period`, adds the optional project
 * `meta.style`, and adds the optional per-floor `periodOverride` and
 * `styleOverride`.
 *
 * Only the rename needs data work: the migration moves `meta.era` to
 * `meta.period` when the legacy key is present and removes the old key. The new
 * style and floor fields are optional and an absent value is treated identically
 * to an unset one, so they need no defaulting here. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addPeriodAndStyleMigration: SchemaMigration = {
  from: 4,
  migrate(project) {
    const meta = project.meta as Record<string, unknown>
    if (!('era' in meta)) {
      return project
    }
    const period = meta.era
    const migratedMeta: Record<string, unknown> = { ...meta }
    delete migratedMeta.era
    migratedMeta.period = period
    return { ...project, meta: migratedMeta } satisfies ProjectShape
  },
}
