// scripts/schema/build-validators.mjs
//
// Pure builder of the two validators for the current schema, as standalone ES module source.
// The strict validator follows the schema exactly. The tolerant one follows the same schema with
// every `additionalProperties: false` removed, so an unknown field is accepted wherever it
// appears (ADR-0178). Standalone code needs no schema compiler at run time.

import Ajv from 'ajv'
import standaloneCode from 'ajv/dist/standalone/index.js'

/** Repository-relative path of the strict validator. */
export const STRICT_VALIDATOR_PATH = 'core/format/generated/current-schema-validator.js'

/** Repository-relative path of the tolerant validator. */
export const TOLERANT_VALIDATOR_PATH = 'core/format/generated/tolerant-schema-validator.js'

/** Repository-relative path of the declaration of the strict validator. */
export const STRICT_DECLARATION_PATH = 'core/format/generated/current-schema-validator.d.ts'

/** Repository-relative path of the declaration of the tolerant validator. */
export const TOLERANT_DECLARATION_PATH = 'core/format/generated/tolerant-schema-validator.d.ts'

const VALIDATOR_DECLARATION = `import type { ErrorObject } from 'ajv'

/** Standalone validator generated with the schema (\`pnpm schema:generate\`). */
declare function validate(document: unknown): boolean
declare namespace validate {
  /** The faults of the latest call; null after a call that passed. */
  let errors: ErrorObject[] | null
}

export { validate }
export default validate
`

/** The text of the declaration that both validators share. */
export function buildValidatorDeclaration() {
  return VALIDATOR_DECLARATION
}

/** A copy of a schema in which no object rejects unknown fields. */
export function withoutClosedObjects(node) {
  if (Array.isArray(node)) return node.map(withoutClosedObjects)
  if (typeof node !== 'object' || node === null) return node
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, value]) => !(key === 'additionalProperties' && value === false))
      .map(([key, value]) => [key, withoutClosedObjects(value)]),
  )
}

function standaloneSource(schema) {
  // On: `allErrors` reports every fault, and `strictNumbers` makes a number field refuse NaN and
  // Infinity, which JSON would store as null and the project would fail to open later. Off:
  // `strict` (Ajv's schema-quality checks, which reject metadata keywords the generated schema
  // keeps beside a `$ref`) and with it the other strict switches, such as `strictTypes`.
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    strictNumbers: true,
    code: { source: true, esm: true },
  })
  return standaloneCode(ajv, ajv.compile(schema))
}

/** The standalone source of the strict and the tolerant validator for a schema. */
export function buildValidatorSources(schema) {
  return {
    strict: standaloneSource(schema),
    tolerant: standaloneSource(withoutClosedObjects(schema)),
  }
}
