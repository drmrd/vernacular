import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-8 document forward to version 9. Version 9 generalizes a
 * stored paint assignment from `{ color, finishId }` to a `SurfaceTreatment`
 * discriminated union whose only built variant is solid color, so each legacy
 * assignment is wrapped as `{ kind: 'solid', color, finishId }`. A document with
 * no `paint` map needs no data work and passes through unchanged. The orchestrator
 * advances `meta.schemaVersion`, so the migration must not.
 */
export const addSurfaceTreatmentMigration: SchemaMigration = {
  from: 8,
  migrate(project: ProjectShape): ProjectShape {
    const paint = project.paint
    if (paint === undefined || paint === null) {
      return project
    }
    const wrapped: Record<string, unknown> = {}
    for (const [key, assignment] of Object.entries(paint as Record<string, unknown>)) {
      wrapped[key] = { kind: 'solid', ...(assignment as Record<string, unknown>) }
    }
    return { ...project, paint: wrapped }
  },
}
