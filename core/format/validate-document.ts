import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'

/** The outcome of validating a Document against a VFPF schema. */
export interface DocumentValidationResult {
  valid: boolean
  errors: ErrorObject[]
}

/** Validates a single Document and reports whether it conforms. */
export type DocumentValidator = (document: unknown) => DocumentValidationResult

/**
 * Compile a reusable validator for Vernacular Floor Plan Format Documents from a
 * generated CORE JSON Schema. The schema is supplied by the caller (the published
 * artifact under schema/<version>/), so core/ stays decoupled from where the file
 * lives. See docs/specs/2026-06-10-vernacular-floor-plan-format.md.
 */
export function createDocumentValidator(schema: object): DocumentValidator {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate: ValidateFunction = ajv.compile(schema)
  return (document: unknown): DocumentValidationResult => {
    const valid = validate(document) === true
    return { valid, errors: valid ? [] : (validate.errors ?? []) }
  }
}
