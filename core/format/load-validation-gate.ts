import type { ErrorObject } from 'ajv'
import type { DocumentValidator } from './validate-document'

/** Receives the CORE-shape errors a load gate found; never invoked for a conformant document. */
export type DocumentIssueReporter = (errors: ErrorObject[]) => void

export interface LoadValidationGateOptions {
  validate: DocumentValidator
  report: DocumentIssueReporter
}

/**
 * Build a non-fatal load gate: it validates an already-migrated Document and reports any CORE-shape
 * issues, but never throws, because migration (not validation) is the user-facing compatibility path
 * (VFPF section 8). Reserved keys are tolerated upstream by the validator.
 */
export function createLoadValidationGate(
  options: LoadValidationGateOptions,
): (document: unknown) => void {
  return (document: unknown): void => {
    const result = options.validate(document)
    if (!result.valid) {
      options.report(result.errors)
    }
  }
}
