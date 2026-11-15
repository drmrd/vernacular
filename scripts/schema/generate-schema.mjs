// scripts/schema/generate-schema.mjs
//
// Write side of CORE schema generation. Serializes buildProjectSchema() to
// schema/<version>/vernacular.schema.json and the table of known keys to
// core/model/known-keys.json, or (with --check) verifies both committed files
// match the regenerated output and exits non-zero on drift.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildProjectSchema, SCHEMA_VERSION } from './build-schema.mjs'
import { buildKnownKeys } from './build-known-keys.mjs'

const JSON_INDENT = 2
const EXIT_DRIFT = 1

function serialize(value) {
  return JSON.stringify(value, null, JSON_INDENT) + '\n'
}

const schema = buildProjectSchema()
const outputs = [
  { path: `schema/${SCHEMA_VERSION}/vernacular.schema.json`, content: serialize(schema) },
  { path: 'core/model/known-keys.json', content: serialize(buildKnownKeys(schema)) },
]

if (process.argv.includes('--check')) {
  const stale = outputs.filter(
    ({ path, content }) => (existsSync(path) ? readFileSync(path, 'utf8') : '') !== content,
  )
  for (const { path } of stale) {
    console.error(`Schema drift: ${path} is out of date. Run \`pnpm schema:generate\`.`)
  }
  if (stale.length > 0) process.exit(EXIT_DRIFT)
  for (const { path } of outputs) console.log(`${path} is up to date.`)
} else {
  for (const { path, content } of outputs) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    console.log(`Wrote ${path}`)
  }
}
