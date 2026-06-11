// scripts/schema/build-schema.mjs
//
// Pure builder for the Vernacular Floor Plan Format CORE JSON Schema. It runs
// ts-json-schema-generator over the core/model TypeScript types (the single
// source of truth) and returns the schema object. The generate script owns the
// write side effect; this module owns projecting the types into a schema.

import { readFileSync } from 'node:fs'
import { createGenerator } from 'ts-json-schema-generator'

// Track the live format version from the single source of truth so the schema
// follows the model as other work bumps it; never hardcode the version here.
const factoriesSource = readFileSync('core/model/factories.ts', 'utf8')
const versionMatch = factoriesSource.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/)
if (versionMatch === null) {
  throw new Error('Could not read CURRENT_SCHEMA_VERSION from core/model/factories.ts')
}

/** The live format version, read from core/model/factories.ts. */
export const SCHEMA_VERSION = Number(versionMatch[1])

/** Stable, versioned identifier for the published CORE schema. */
export const SCHEMA_ID = `https://drmrd.github.io/vernacular/schema/${SCHEMA_VERSION}/vernacular.schema.json`

/**
 * Build the CORE JSON Schema for the Vernacular Floor Plan Format from the
 * TypeScript domain types. The types in core/model are the single source of
 * truth; this function projects them into the published artifact.
 *
 * @returns {object} the JSON Schema for a Project Document
 */
export function buildProjectSchema() {
  const config = {
    path: 'core/model/types.ts',
    tsconfig: 'tsconfig.json',
    type: 'Project',
    expose: 'export',
    topRef: false,
    jsDoc: 'extended',
    additionalProperties: false,
  }
  const schema = createGenerator(config).createSchema(config.type)
  schema.$id = SCHEMA_ID
  schema.title = 'Vernacular Floor Plan Format Document'
  return schema
}
