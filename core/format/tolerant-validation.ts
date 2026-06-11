import type { DocumentValidationResult, DocumentValidator } from './validate-document'
import { createDocumentValidator } from './validate-document'

/**
 * A CORE validator that tolerates unknown and reserved keys: it drops Ajv `additionalProperties`
 * violations so a reported error always signals a genuine CORE-shape break (wrong type, missing
 * required field). Used as the non-fatal load gate (VFPF sections 6.4, 7, 8). Reserved keys and
 * extension payloads are preserved by design, so they must not surface as gate issues.
 */
export function createTolerantValidator(schema: object): DocumentValidator {
  const validate = createDocumentValidator(schema)
  return (document: unknown): DocumentValidationResult => {
    const { errors } = validate(document)
    const shapeErrors = errors.filter((error) => error.keyword !== 'additionalProperties')
    return { valid: shapeErrors.length === 0, errors: shapeErrors }
  }
}
