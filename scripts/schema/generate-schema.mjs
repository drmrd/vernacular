// scripts/schema/generate-schema.mjs
//
// Write side of CORE schema generation. Serializes buildProjectSchema() to
// schema/<version>/vernacular.schema.json, or (with --check) verifies the
// committed file matches the regenerated schema and exits non-zero on drift.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildProjectSchema, SCHEMA_VERSION } from './build-schema.mjs'

const JSON_INDENT = 2
const EXIT_DRIFT = 1

const out = `schema/${SCHEMA_VERSION}/vernacular.schema.json`
const serialized = JSON.stringify(buildProjectSchema(), null, JSON_INDENT) + '\n'

if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : ''
  if (current !== serialized) {
    console.error(`Schema drift: ${out} is out of date. Run \`pnpm schema:generate\`.`)
    process.exit(EXIT_DRIFT)
  }
  console.log(`${out} is up to date.`)
} else {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, serialized)
  console.log(`Wrote ${out}`)
}
