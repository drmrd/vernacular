import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-14 document to version 15 by backfilling the top-level
 * `environmentScenes` array; an already-present array is preserved unchanged. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addEnvironmentScenesMigration: SchemaMigration = {
  from: 14,
  migrate(project) {
    const environmentScenes = project.environmentScenes
    return {
      ...project,
      environmentScenes: Array.isArray(environmentScenes) ? environmentScenes : [],
    } satisfies ProjectShape
  },
}
