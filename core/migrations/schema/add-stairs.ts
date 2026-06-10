import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-5 document to version 6 by backfilling the top-level
 * `stairs` array; an already-present array is preserved unchanged. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addStairsMigration: SchemaMigration = {
  from: 5,
  migrate(project) {
    const stairs = project.stairs
    return { ...project, stairs: Array.isArray(stairs) ? stairs : [] } satisfies ProjectShape
  },
}
