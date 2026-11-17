import type { ErrorObject } from 'ajv'

/** Standalone validator generated with the schema (`pnpm schema:generate`). */
declare function validate(document: unknown): boolean
declare namespace validate {
  /** The faults of the latest call; null after a call that passed. */
  let errors: ErrorObject[] | null
}

export { validate }
export default validate
