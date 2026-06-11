import vernacularSchema from '../schema/8/vernacular.schema.json'
import { createLoadValidationGate, createTolerantValidator } from '../core'
import type { Project } from '../core'

// The CORE schema version tracks CURRENT_SCHEMA_VERSION; advance this import path when the schema
// version advances. The gate is built lazily so a production build never compiles Ajv for a gate it
// will not run.
let gate: ((document: unknown) => void) | undefined

function loadValidationGate(): (document: unknown) => void {
  gate ??= createLoadValidationGate({
    validate: createTolerantValidator(vernacularSchema),
    report: (errors) => console.warn('vernacular: loaded document failed CORE validation', errors),
  })
  return gate
}

/**
 * Non-fatal development gate: after migration on app load, validate the Document against the CORE
 * schema (tolerating reserved and unknown keys) and warn on a genuine shape break. Migration, not
 * validation, is the user-facing compatibility path (VFPF section 8), so this never rejects a load.
 */
export function validateLoadedProject(project: Project): void {
  if (import.meta.env.DEV) {
    loadValidationGate()(project)
  }
}
