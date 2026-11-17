import type { ErrorObject } from 'ajv'
import type { FormatFault } from './codec/codec-types'
import validateStrict from './generated/current-schema-validator.js'
import validateTolerant from './generated/tolerant-schema-validator.js'

const ADDITIONAL_PROPERTIES = 'additionalProperties'

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function faultPath(error: ErrorObject): string {
  if (error.keyword !== ADDITIONAL_PROPERTIES) return error.instancePath
  const field = String(error.params.additionalProperty)
  return `${error.instancePath}/${escapePointerSegment(field)}`
}

function toFault(error: ErrorObject): FormatFault {
  return { path: faultPath(error), rule: error.keyword, message: error.message ?? error.keyword }
}

/**
 * How a check treats a field that the schema does not name: `strict` refuses an unknown field
 * outside `extensions`; `tolerant` accepts an unknown field anywhere (ADR-0178).
 */
export type SchemaMode = 'strict' | 'tolerant'

/**
 * Check a document against the schema of the current version and revision in the given mode.
 * An empty array means that the document passes.
 */
export function checkCurrentSchema(document: unknown, mode: SchemaMode): FormatFault[] {
  const validate = mode === 'strict' ? validateStrict : validateTolerant
  return validate(document) ? [] : (validate.errors ?? []).map(toFault)
}
