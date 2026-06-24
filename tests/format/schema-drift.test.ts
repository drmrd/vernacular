import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProjectSchema, SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

const JSON_INDENT = 2

// Regenerating the VFPF schema from the TypeScript types is CPU-bound and can
// exceed Vitest's 5s per-test default when the full unit suite saturates the
// worker pool, even though it finishes in about a second in isolation.
const SCHEMA_BUILD_TIMEOUT_MS = 30_000

describe('VFPF schema drift guard', () => {
  it(
    'the committed schema matches the schema generated from the types',
    { timeout: SCHEMA_BUILD_TIMEOUT_MS },
    () => {
      const committed = readFileSync(
        resolve(`schema/${SCHEMA_VERSION}/vernacular.schema.json`),
        'utf8',
      )
      const regenerated = JSON.stringify(buildProjectSchema(), null, JSON_INDENT) + '\n'
      expect(regenerated).toEqual(committed)
    },
  )
})
