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
 * Check a document against the schema of the current version and revision. The strict check
 * refuses an unknown field outside `extensions`; the tolerant check accepts one (ADR-0178).
 * An empty array means that the document passes.
 */
export function checkCurrentSchema(document: unknown, mode: 'strict' | 'tolerant'): FormatFault[] {
  const validate = mode === 'strict' ? validateStrict : validateTolerant
  return validate(document) ? [] : (validate.errors ?? []).map(toFault)
}
