import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-5 document to version 6 by backfilling the top-level
 * `stairs` array; an already-present array is preserved unchanged. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addStairsMigration: SchemaMigration = {
  from: 5,
  migrate(project) {
    // `stairs` is absent on version-5-and-earlier documents (the normal case),
    // so unlike sibling migrations there is no early return; the spread copies
    // through `undefined` and the `Array.isArray` fallback supplies `[]`.
    const stairs = project.stairs
    return { ...project, stairs: Array.isArray(stairs) ? stairs : [] } satisfies ProjectShape
  },
}
