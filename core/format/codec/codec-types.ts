/** One reason that a document fails a check against the schema. */
export interface FormatFault {
  /** JSON pointer; for an unknown field, the field's own path. */
  readonly path: string
  /** The schema keyword that the document fails, such as `required` or `type`. */
  readonly rule: string
  /** A readable statement of the failure. */
  readonly message: string
}
