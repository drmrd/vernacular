// scripts/schema/generate-schema.mjs
//
// Write side of CORE schema generation. Serializes buildProjectSchema() to the path for the
// current version and revision (see schemaPath) and the table of known keys to
// core/model/known-keys.json, or (with --check) verifies every committed file matches the
// regenerated output. The schema check uses driftVerdict: a changed schema must come with a
// higher version or revision (ADR-0178). It also writes the strict and the tolerant validator
// for the current schema as standalone modules under core/format/generated/. Drift exits non-zero.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  buildProjectSchema,
  driftVerdict,
  INITIAL_REVISION,
  schemaPath,
  SCHEMA_REVISION,
  SCHEMA_VERSION,
} from './build-schema.mjs'
import { buildKnownKeys } from './build-known-keys.mjs'
import {
  buildValidatorDeclaration,
  buildValidatorSources,
  STRICT_DECLARATION_PATH,
  STRICT_VALIDATOR_PATH,
  TOLERANT_DECLARATION_PATH,
  TOLERANT_VALIDATOR_PATH,
} from './build-validators.mjs'

const JSON_INDENT = 2
const EXIT_DRIFT = 1
const NO_COMMITTED_SCHEMA = { version: 0, revision: INITIAL_REVISION }
const REVISION_DIRECTORY = /^revision-(\d+)$/

function serialize(value) {
  return JSON.stringify(value, null, JSON_INDENT) + '\n'
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Every committed schema as a version and revision pair; revision 0 is the unnumbered path. */
function committedSchemas() {
  return readdirSync('schema')
    .filter((name) => /^\d+$/.test(name))
    .flatMap((name) => {
      const version = Number(name)
      const revisions = readdirSync(`schema/${name}`)
        .map((entry) => REVISION_DIRECTORY.exec(entry))
        .filter((match) => match !== null)
        .map((match) => Number(match[1]))
      return [INITIAL_REVISION, ...revisions]
        .filter((revision) => existsSync(schemaPath(version, revision)))
        .map((revision) => ({ version, revision }))
    })
}

function latestCommittedSchema() {
  const latest = committedSchemas().sort((a, b) => a.version - b.version || a.revision - b.revision)
  return latest.at(-1) ?? NO_COMMITTED_SCHEMA
}

function checkSchema(content) {
  const latest = latestCommittedSchema()
  const verdict = driftVerdict(readIfExists(schemaPath(latest.version, latest.revision)), content, {
    version: SCHEMA_VERSION,
    revision: SCHEMA_REVISION,
    committedVersion: latest.version,
    committedRevision: latest.revision,
  })
  if (!verdict.ok) console.error(`Schema drift: ${verdict.message}`)
  return verdict.ok
}

function checkDerivedFile({ path, content }) {
  const current = (readIfExists(path) ?? '') === content
  if (!current) console.error(`Schema drift: ${path} is out of date. Run \`pnpm schema:generate\`.`)
  return current
}

const schema = buildProjectSchema()
const validatorSources = buildValidatorSources(schema)
const schemaOutput = {
  path: schemaPath(SCHEMA_VERSION, SCHEMA_REVISION),
  content: serialize(schema),
}
const knownKeysOutput = {
  path: 'core/model/known-keys.json',
  content: serialize(buildKnownKeys(schema)),
}
const derivedOutputs = [
  knownKeysOutput,
  { path: STRICT_VALIDATOR_PATH, content: validatorSources.strict },
  { path: TOLERANT_VALIDATOR_PATH, content: validatorSources.tolerant },
  { path: STRICT_DECLARATION_PATH, content: buildValidatorDeclaration() },
  { path: TOLERANT_DECLARATION_PATH, content: buildValidatorDeclaration() },
]

if (process.argv.includes('--check')) {
  // The file at the current path must exist and match: the drift verdict alone passes when the
  // numbers rose above the latest committed schema, even if the current schema was never written.
  const upToDate = [
    checkSchema(schemaOutput.content),
    ...[schemaOutput, ...derivedOutputs].map(checkDerivedFile),
  ]
  if (upToDate.includes(false)) process.exit(EXIT_DRIFT)
  const checkedPaths = [schemaOutput, ...derivedOutputs].map(({ path }) => path)
  console.log(`Up to date: ${checkedPaths.join(', ')}`)
} else {
  for (const { path, content } of [schemaOutput, ...derivedOutputs]) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    console.log(`Wrote ${path}`)
  }
}
