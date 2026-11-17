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
const FACTORIES_PATH = 'core/model/factories.ts'
const factoriesSource = readFileSync(FACTORIES_PATH, 'utf8')

function readFactoriesConstant(name) {
  const match = factoriesSource.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`))
  if (match === null) throw new Error(`Could not read ${name} from ${FACTORIES_PATH}`)
  return Number(match[1])
}

/** The live format version, read from core/model/factories.ts. */
export const SCHEMA_VERSION = readFactoriesConstant('CURRENT_SCHEMA_VERSION')

/** The revision that keeps the schema path used before revisions existed. */
export const INITIAL_REVISION = 0

const SCHEMA_HOST = 'https://drmrd.github.io/vernacular'

/** The live additive revision within the format version, read from core/model/factories.ts. */
export const SCHEMA_REVISION = readFactoriesConstant('CURRENT_SCHEMA_REVISION')

/**
 * Repository-relative path of the schema for a version and revision. Revision 0 keeps the
 * path used before revisions existed; a later revision gets its own directory (ADR-0178).
 */
export function schemaPath(version, revision) {
  const directory =
    revision > INITIAL_REVISION ? `schema/${version}/revision-${revision}` : `schema/${version}`
  return `${directory}/vernacular.schema.json`
}

/** Stable, versioned identifier for the published CORE schema. */
export const SCHEMA_ID = `${SCHEMA_HOST}/${schemaPath(SCHEMA_VERSION, SCHEMA_REVISION)}`

/** True when the live version, or the live revision of the same version, is above the committed one. */
function numbersRose(numbers) {
  const versionRose = numbers.version > numbers.committedVersion
  const revisionRose =
    numbers.version === numbers.committedVersion && numbers.revision > numbers.committedRevision
  return versionRose || revisionRose
}

/**
 * Decide whether a regenerated schema may differ from the latest committed one. A published
 * schema is fixed, so a change needs a higher version, or a higher revision of the same version.
 *
 * @param {string | null} committed serialized committed schema, or null when none exists yet
 * @param {string} regenerated serialized schema regenerated from the types
 * @param {{ version: number, revision: number, committedVersion: number, committedRevision: number }} numbers
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function driftVerdict(committed, regenerated, numbers) {
  if (committed === null || committed === regenerated || numbersRose(numbers)) return { ok: true }
  return {
    ok: false,
    message:
      `The schema changed but neither number rose: still version ${numbers.version}, ` +
      `revision ${numbers.revision}. Raise the schema revision (additive change) or the ` +
      'schema version (breaking change) in core/model/factories.ts, then run `pnpm schema:generate`.',
  }
}

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
