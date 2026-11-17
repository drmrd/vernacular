/** One reason that a document fails a check against the schema. */
export interface FormatFault {
  /** JSON pointer; for an unknown field, the field's own path. */
  readonly path: string
  readonly rule: string
  readonly message: string
}
