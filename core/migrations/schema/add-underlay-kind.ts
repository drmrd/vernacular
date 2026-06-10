import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-6 document forward to version 7, which replaces each
 * underlay's bare top-level `image` with a discriminated `source`, wrapping the
 * legacy image in a raster source. An underlay that already carries a `source`
 * is left unchanged. The orchestrator advances `meta.schemaVersion`, so the
 * migration must not.
 */
export const addUnderlayKindMigration: SchemaMigration = {
  from: 6,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) {
      return project
    }
    const migrated = floors.map((floor) => {
      const record = floor as Record<string, unknown>
      const underlays = Array.isArray(record.underlays) ? record.underlays : []
      return { ...record, underlays: underlays.map(migrateUnderlay) }
    })
    return { ...project, floors: migrated } satisfies ProjectShape
  },
}

function migrateUnderlay(underlay: unknown): unknown {
  const record = underlay as Record<string, unknown>
  if (record.source !== undefined) {
    return record
  }
  const { image, ...rest } = record
  return { ...rest, source: { kind: 'raster', image } }
}
